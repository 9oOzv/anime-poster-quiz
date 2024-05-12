import { arrayAlmostHas, inBetween, tmpRef } from './utils.mjs';
import bunyan from 'bunyan'

const log = bunyan.createLogger(
  {
    name: 'anilist-poster-quiz',
    src: true
  }
);


function isValidMedia(media) {
  if(!media) {
    log.warn({ media });
    return false;
  }
  if(!media.coverImage.extraLarge) {
    log.trace({ media });
    return false;
  }
  if(!(media.title.english || media.title.romaji)) {
    log.trace({ media });
    return false;
  }
  return true;
}


const mediaFilters = new Map(Object.entries({
  popularity: (m, min, max) => inBetween(m.popularity, min, max),
  favourites: (m, min, max) => inBetween(m.favourites, min, max),
  year: (m, min, max) => inBetween(m.seasonYear, min, max),
  sfw: (m) => m.isAdult,
  nsfw: (m) => !m.isAdult,
  genres: (m, ...genres) => genres.some(g => arrayAlmostHas(m.genres, g)),
  tags: (m, ...tags) => tags.some(t => arrayAlmostHas((m.tags ?? []).map(t => t.name), t)),
  validMedia: isValidMedia
}));


class Filter {

  #name
  #f
  #args

  constructor(filterSpec) {
    this.#name = filterSpec.name;
    this.#f = mediaFilters.get(filterSpec.name);
    this.#args = filterSpec.args;
  }
  
  run(media) {
    let ref = tmpRef();
    log.trace({ ref: ref, filter: this.info, media: media.info });
    const pass = this.#f(media, ...this.#args);
    log.trace({ ref: ref, filter: this.info, media: media, pass: pass });
    return pass;
  }

  get info() {
    return {
      name: this.#name,
      args: this.#args
    }
  }
}


class FilterCollection {
  #filters = [];
  #filterSpecs = [];

  constructor(filterSpecs) {
    log.debug({ filterSpecs });
    this.#filterSpecs = [
      {
        name: 'validMedia',
        args: []
      },
      ...filterSpecs
    ];
    this.createFilters();
  }

  createFilter(filterSpec) {
    log.debug({ filterSpec });
    this.#filters.push(new Filter(filterSpec));
  }

  createFilters() {
    this.#filters = [];
    for(const f of this.#filterSpecs) {
      this.createFilter(f);
    }
  }

  filter(medias) {
    log.debug({ info: this.info });
    const filters = this.#filters;
    return medias.filter(
      m => filters.every(f => f.run(m))
    )
  }

  get info() {
    return {
      filters: this.#filters.map(f => f.info)
    }
  }

}


export {
  mediaFilters,
  Filter,
  FilterCollection
};
