const uid = () => Date.now().toString(36);
const normalizeString = (str) => str.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const combineSimilar = (array) => Array.from(new Map(array.map(v => [normalizeString(v), v])).values());
const compare = (a, b) => normalizeString(a) === normalizeString(b);
const arrayAlmostHas = (array, value) => Array.isArray(array) && array.some(v => compare(v, value));
const inBetween = (v, a, b) => (a ?? -Infinity) <= v && v <= (b ?? Infinity);
const truncate = (s, n) => s.length > n ? `${s.slice(0, n - 3)}...` : s;
const countNewlines = (text) => text.split(/\r\n|\r|\n/).length;
const nonNulls = (array) => array.filter(v => (v ?? null) !== null);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const random = (array) => array[Math.floor(Math.random() * array.length)];


function wrap(text, width, firstLineWidth) {
  var lines = text.split('\n');
  if(lines.length > 1){
    return lines.map(l => wrap(l, width)).join('\n');
  }
  firstLineWidth ??= width;
  let words = text.split(' '); // Split text into words
  lines = [];
  let currentLine = '';
  words.forEach(word => {
    if (currentLine.length + word.length <= width) {
      currentLine += word + ' ';
    } else {
      lines.push(currentLine);
      currentLine = word + ' ';
    }
  });
  lines.push(currentLine);
  return lines.join('\n');
}


function indent(text, indent, indentFirstLine = true) {
  const lines = text?.split('\n');
  if(indentFirstLine) {
    return `${indent}${lines.join(`\n${indent}`)}`;
  } else {
    return lines.join(`\n${indent}`) 
  }
}


export {
  arrayAlmostHas,
  compare,
  countNewlines,
  inBetween,
  indent,
  nonNulls,
  normalizeString,
  random,
  sleep,
  truncate,
  uid,
  wrap,
  combineSimilar,
}

