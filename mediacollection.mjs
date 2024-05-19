import { Media } from './media.mjs';
import { getLog } from './log.mjs';

const log = getLog('apq');

class MediaCollection {

  #id;
  #data;
  #filterCollection;
  #completions;
  #medias;

  constructor(mediaData) {
    const id = Date.now().toString(36);
    this.#id = id;
    log.trace('Creating MediaCollection', { this: this, mediaData });
    this.#data = mediaData;
    this.createMedias(this.#data);
  }

  createMedias() {
    log.info({ this: this, mediaDataLength: this.#data.length }, 'Creating medias');
    const fc = this.#filterCollection;
    const filteredData = fc ?
      fc.filter(this.#data)
      : this.#data;
    log.info({ this: this, filteredDataLength: this.#data.length }, 'Filtered medias');
    this.#medias = filteredData.map(m => new Media(m));
    this.#completions = null;
  }

  setFilters(filterCollection) {
    this.#filterCollection = filterCollection;
    this.createMedias();
  }

  generateCompletions() {
    const completions = [
      ...new Map(
        new Array().concat(
          ...this.#medias.map(
            m => [ ...m.normalizedCompletions ]
          )
        )
      )
    ].map(v => v[1]);
    log.trace({ completions });
    return completions
  }

  completions() {
    log.trace({this: this});
    return this.#completions ??= this.generateCompletions();
  }

  random() {
    return this.#medias[
      Math.floor(
        Math.random() * this.#medias.length
      )
    ];
  }
}

export {
  MediaCollection
}
