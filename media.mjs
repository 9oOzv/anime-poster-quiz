import { normalizeString } from './utils.mjs';
import { loadImage } from 'canvas'

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

export {
  Media
}
