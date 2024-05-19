import { createCanvas } from 'canvas';

class HintImage {
  #circles = [];
  #image;
  #jpegBuffer;

  constructor(image) {
    this.#image = image;
    this.#jpegBuffer = this.dummyImage();
  }


  dummyImage(){
      return createCanvas(10, 10).toBuffer();
  }

  createRandomCircle(width, height, minRadius = 0, maxRadius = 1) {
    const radiusFrac = minRadius + Math.random() * (maxRadius - minRadius);
    const radius = radiusFrac * Math.max(width, height);
    const x = Math.random() * (width - 2 * radius) + radius;
    const y = Math.random() * (height - 2 * radius) + radius;
    return { x, y, radius };
  }

  async revealCircle(minRadius, maxRadius) {
    this.#circles.push(
      this.createRandomCircle(
        this.width,
        this.height,
        minRadius,
        maxRadius
      )
    );
    this.revealCircles();
  }

  async revealCircles() {
    const canvas = this.blackCanvas(
      this.width,
      this.height
    );
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ctx.createPattern(
      await this.#image,
      "repeat"
    );
    this.#circles.forEach(circle => {
      ctx.beginPath();
      ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    this.#jpegBuffer = canvas.toBuffer('image/jpeg');
  }

  async revealAll() {
    const canvas = this.blackCanvas(
      this.width,
      this.height
    )
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ctx.createPattern(this.#image, "repeat");;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.#jpegBuffer = canvas.toBuffer('image/jpeg');
  }

  blackCanvas(w, h) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    return canvas;
  }

  get jpeg() {
    return this.#jpegBuffer;
  }

  get width() {
    return this.#image.width;
  }

  get height() {
    return this.#image.height;
  }

  get numCircles() {
    return this.#circles.length;
  }

}

export {
  HintImage
}
