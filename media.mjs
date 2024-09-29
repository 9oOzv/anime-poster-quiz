import { log } from './log.mjs';
import { loadImage } from 'canvas';
import { normalizeString } from './utils.mjs';

class Media {

  #image;
  #data;
  #answers;

  constructor(data) {
    this.#data = data;
  }

  get answers() {
    return this.#answers ??= [
      this.#data.title.english,
      this.#data.title.romaji,
      this.#data.title.native,
      ...this.synonyms,
      ...this.hashtags
    ].filter(a => a !== null);
  }

  get synonyms() {
    return this.#data.synonyms ?? [];
  }

  get hashtags() {
    return (this.#data.hashtag ?? '').split(/ +/);
  }
get normalizedCompletions() {
    return new Map(
      this.answers.map(a => [ normalizeString(a), a ])
    );
  }

  get displayAnswer() {
    return [
      this.#data.title.romaji,
      this.#data.title.english,
      this.#data.title.native
    ].join(' | ');
  }
  
  async image() {
    return this.#image ??= loadImage(
      this.#data.coverImage.extraLarge
    );
  }

  get info() {
    return this.#data;
  }

}


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
    var fc
    const filteredData = (fc = this.#filterCollection) ?
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
  Media,
  MediaCollection
}
