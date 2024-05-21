import { arrayAlmostHas, inBetween } from './utils.mjs';
import { getLog } from './log.mjs';

const log = getLog('apq');


function isValidMedia(media) {
  switch(undefined) {
    case media:
      log.warn({ media });
      return false;
    case media.coverImage?.extraLarge:
    case media.title?.english ?? media.title?.romaji:
      log.trace({ media });
      return false;
    default:
      return true;
  }
}


const mediaFilters = new Map(
  Object.entries(
    {
      popularity: (m, min, max) => inBetween(m.popularity, min, max),
      favourites: (m, min, max) => inBetween(m.favourites, min, max),
      year: (m, min, max) => inBetween(m.seasonYear, min, max),
      sfw: (m) => m.isAdult,
      nsfw: (m) => !m.isAdult,
      genres: (m, ...genres) => genres.some(g => arrayAlmostHas(m.genres, g)),
      tags: (m, ...tags) => tags.some(t => arrayAlmostHas((m.tags ?? []).map(t => t.name), t)),
      validMedia: isValidMedia
    }
  )
);


class Filters {
  #filters = [];
  #filterSpecs = [];

  constructor(filterSpecs) {
    log.debug({ filterSpecs });
    this.#filterSpecs = {
      validMedia: {},
      ...filterSpecs
    };
    this.createFilters();
  }

  createFilters() {
    this.#filters = 
      Object.entries(this.#filterSpecs)
      .filter(([, { enabled }]) => enabled)
      .map(([name, { args }]) => {
        const mf = mediaFilters.get(name);
        return (media) => mf(media, ...args)
      });
  }

  run(medias) {
    log.debug({ filters: this.#filters });
    return medias.filter(
      m => this.#filters.every(f => f(m))
    )
  }

}


export default Filters;
