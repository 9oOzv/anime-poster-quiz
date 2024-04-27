
function normalizeString(str) {
  return str
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}


function isTypeable(str) {
  if(typeof str !== 'string') { return false; }
  return true
}


function compare(a, b) {
  const c = a.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const d = b.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return c === d;
}


function arrayAlmostHas(array, value) {
  if(!Array.isArray(array)){
    return false;
  }
  return array.some(v => compare(v, value));
}


function inBetween(v, a, b) {
  return (a ?? -Infinity) <= v && v <= (b ?? Infinity);
}


function truncate(text, width) {
  return text.width > width
    ? `${text.slice(0, width - 3)}...`
    : text;
}


function countNewlines(text) {
  return text.split(/\r\n|\r|\n/).length;
}


function prettyShort(text, maxLines, maxLineWidth, maxLength) {
  const pretty = wrap(JSON.stringify(text, null, 2), maxLineWidth) ;
  if(countNewlines(pretty) < maxLines) {
    return pretty;
  }
  return truncate(
    wrap(
      JSON.stringify(text)
      , maxLineWidth
    ),
    maxLength
  );
}


function wrap(text, width, firstLineWidth) {
  var lines = text.split('\n');
  if(lines.length > 1){
    return lines.map(l => wrap(l, width)).join('\n');
  }
  firstLineWidth ??= width;
  let words = text.split(' '); // Split text into words
  lines = [];
  let currentLine = '';
  let currentWidth = firstLineWidth;
  words.forEach(word => {
    if (currentLine.length + word.length <= width) {
      currentLine += word + ' ';
    } else {
      lines.push(currentLine);
      currentWidth = width;
      currentLine = word + ' ';
    }
  });
  lines.push(currentLine);
  return lines.join('\n');
}

function stringy(object) {
  return JSON.stringify();
}


function indent(text, indent, indentFirstLine = true) {
  const lines = text.split('\n');
  if(indentFirstLine) {
    return `${indent}${lines.join(`\n${indent}`)}`;
  } else {
    return lines.join(`\n${indent}`) 
  }
}

function nonNulls(array) {
  return array.filter(v => (v ?? null) !== null);
}

function tmpRef() {
  return Date.now().toString(36).slice(4);
}


async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


module.exports = {
  normalizeString,
  isTypeable,
  compare,
  arrayAlmostHas,
  inBetween,
  truncate,
  prettyShort,
  countNewlines,
  wrap,
  indent,
  nonNulls,
  tmpRef,
  sleep
}

