const { arrayAlmostHas, inBetween } = require('./utils.js');


function isValidMedia(media) {
  if(!media) {
    logger.warning('Missing media', { media });
    return false;
  }
  if(!media.coverImage.extraLarge) {
    logger.verbose('Cover image missing', { media });
    return false;
  }
  if(!(media.title.english || media.title.romaji)) {
    logger.verbose('Missing title', { media });
    return false;
  }
  return true;
}


mediaFilters = new Map(Object.entries({
  popularity: (m, min, max) => inBetween(m.popularity, min, max),
  favorites: (m, min, max) => inBetween(m.favorites, min, max),
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
    return this.#f(media, ...this.#args);
  }
}


class FilterCollection {
  #filters = [];
  #filterSpecs = [];

  constructor(filterSpecs) {
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
    this.#filters.push(new Filter(filterSpec));
  }

  createFilters() {
    this.#filters = [];
    for(const f of this.#filterSpecs) {
      this.createFilter(f);
    }
  }

  filter(medias) {
    const filters = this.#filters;
    return medias.filter(
      m => filters.every(f => f.run(m))
    )
  }

}


module.exports = {
  mediaFilters,
  Filter,
  FilterCollection
};
