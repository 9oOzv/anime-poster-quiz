var answerInput = null;
var nickInput = null;
var appStatus = null;
var appContent = null;
var completions = null;
var answerDatalist = null;
var compSelection = -1;
var completionTypeCheckbox = null;
var responsiveCheckbox = true;
var image = null;
var setCompletionsFunction = null;
var prevViewId = null;
var currentViewId = null;
var initialViewId = null;
var responsiveLayout = true;

const responsiveIds = [
  "root",
  "body",
  "app"
]

const viewIds = [
  "app-main",
  "menu"
]

var responsiveElements = null;
var viewElements = null;

const worker = new Worker('static/worker.js', { type: "module" });

var statusMessages = [];

function getBlob(response) {
  if (!response.ok) {
    throw new Error('Failed fetching blob');
  }
  return response.blob();
}


async function getJson(response) {
  if (!response.ok) {
    throw new Error('Failed fetching JSON');
  }
  return response.json();
}


async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function reload() {
  console.log('Reloading app')
  location.reload();
}


function unknown() {
  console.log('Received unknown action')
}


function createElement(element, classes, children, textContent) {
  classes ??= [];
  if(!Array.isArray(classes)) {
    classes = [ classes ]
  }
  children ??= [];
  if(!Array.isArray(children)) {
    children = [ children ]
  }
  const e = document.createElement(element);
  classes.forEach(c => e.classList.add(c));
  children.forEach(c => e.appendChild(c));
  if (textContent) {
    e.textContent = textContent;
  }
  return e;
}
 
function replaceContent(element, children, textContent) {
  children ??= [];
  if(!Array.isArray(children)) {
    children = [ children ]
  }
  element.innerHTML = '';
  if (textContent) {
    element.textContent = textContent;
  }
  children.forEach(c => element.appendChild(c));
}


function showMessages(messages) {
  replaceContent(
    appContent,
    messages.map(
      m => createElement(
        'div',
        'message-box',
        statusMessage(m.text, m.classes)
      )
    )
  );
}


function statusMessage(msg, classes) {
  classes ??= []
  if(!Array.isArray(classes)) {
    classes = [ classes ]
  }
  return createElement(
    'div',
    [...classes, 'message'],
    null,
    msg
  )
}


function addStatus(msg, classes) {
  const message = statusMessage(msg, classes);
  appStatus.appendChild(message);
  setTimeout(() => appStatus.removeChild(message), 10000);
}


function reportSuccess(msg) {
  addStatus(msg, 'good');
}


function reportError(error, msg) {
  if(msg) {
    console.warn(msg, error)
    addStatus(msg, 'bad');
  } else {
    console.warn(error)
    addStatus(error, 'bad');
  }
}


function responseReport(response, successMsg, errorMsg) {
  if (!response.ok) {
    reportError(errorMsg);
  } else {
    reportSuccess(successMsg);
  }
}


function createCompletionItem(text) {
  const item = createElement(
    'div',
    'completion-item',
    null,
    text
  )
  item.addEventListener('click', function() {
    answerInput.value = text;
    completions.innerHTML = '';
  });
  return item;
}


function createCompletionOption(text) {
  const item = createElement(
    'option',
    'completion-option',
    null,
    text
  )
  return item;
}


async function updateCompletions() {
  preAutofillInput = answerInput.value;
  worker.postMessage(answerInput.value);
}


function setCompletionItems(texts) {
    replaceContent(answerDatalist, null, '');
    replaceContent(completions, texts.map(createCompletionItem));
}

function setCompletionDatalistOptions(texts) {
    replaceContent(completions, null, '');
    replaceContent(answerDatalist, texts.map(createCompletionOption));
}

worker.onmessage = (e) => {
  console.log(e);
  setCompletionsFunction(e.data);
}


function setCompletionType(native) {
  if (native) {
    completions.style.display = 'none';
    deinitKeyboard();
    setCompletionsFunction = setCompletionDatalistOptions;
  } else {
    setCompletionsFunction = setCompletionItems;
    completions.style.display = 'flex';
    initKeyboard();
  }
}


function resultLine(name, result) {
  class_ = result.correct ? 'good' : 'bad';
  const spans = [
      createElement('span', class_, null, name),
      createElement('span', class_, null, result.answer),
      createElement('span', class_, null, `${result.time}ms`),
      createElement('span', class_, null, result.correct ? '✓' : '✗'),
  ];
  return createElement(
    'div',
    'result-line',
    spans
  )
}

function resultLines(results) {
  return Object.entries(results).map(
    ([name, result]) => resultLine(name, result)
  )
}


function updateSelectedCompletion(items) {
  items.forEach(function(item, index) {
    if (index === compSelection) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
  if (compSelection == -1) {
    answerInput.value = preAutofillInput;
    return
  }
}


function submitAnswer() {
  const answer = answerInput.value;
  const nickname = nickInput.value;
  const data = { answer, nickname };
  console.log('submitting answer')
  fetch('submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => responseReport(response, 'Answer submitted', 'Submission failed'))
  .catch(error => reportError(error, 'Submission failed'));
}


async function doReset() {
  const json = await fetch('reset');
  messages = [];
  completions.innerHTML = '';
  compSelection = -1;
  appMain.innerHTML = '';
  image = null;
}


async function doMessage() {
  const json = await fetch('message')
    .then(res => res.json());
  showMessages(json.data.messages);
}


async function doNextImage() {
  console.log('Fetching image')
  await fetch('next.jpg')
    .then(getBlob)
    .then(blob => {
      const imageUrl = URL.createObjectURL(blob);
      if(image) {
        image.src = imageUrl;
      } else {
        image = createElement('img', 'image');
        image.src = imageUrl;
        image.alt = 'hint';
        replaceContent(appContent, image);
      }
    });
}


async function doResults() {
  console.log('Fetching results')
  await fetch('results')
    .then(getJson)
    .then(results => {
      const lines = resultLines(results);
      replaceContent(
        appContent,
        createElement(
          'div',
          'result-box',
          lines
        )
      )
    });
}


async function doStuff(data) {
  const op = data.action;
  if (op == 'image') {
    await doNextImage();
  } else if (op == 'results') {
    await doResults();
  } else if (op == 'reset') {
    await doReset();
  } else if (op == 'reload') {
    await doReload();
  } else if (op == 'message') {
    await doMessage();
  } else {
    await unknown();
  }
}


function onKeyDown(event) {
    var items = completions.querySelectorAll('div');
    if (event.key === 'ArrowDown') {
      compSelection = Math.min(compSelection + 1, items.length - 1);
      updateSelectedCompletion(items);
    } else if (event.key === 'ArrowUp') {
      compSelection = Math.max(compSelection - 1, -1);
      updateSelectedCompletion(items);
    } else if (event.key === 'Enter') {
      if (compSelection == -1) {
        submitAnswer();
      } else {
        answerInput.value = items[compSelection].textContent;
        completions.innerHTML = '';
        compSelection = -1;
      }
    }
}


function initKeyboard() {
  answerInput.addEventListener("keydown", onKeyDown);
}


function deinitKeyboard() {
  answerInput.removeEventListener("keydown", onKeyDown);
}


function initCompletion() {
  setCompletionType(completionTypeCheckbox.checked);
  answerInput.addEventListener("input", updateCompletions);
  initKeyboard();
}

function updateCompletionType() {
  setCompletionType(completionTypeCheckbox.checked);
}

function updateLayoutType() {
  setResponsive(responsiveCheckbox.checked);
}

function setResponsive(responsive) {
  if (responsive) {
    responsiveElements.forEach(e => e.classList.add('responsive'));
  } else {
    responsiveElements.forEach(e => e.classList.remove('responsive'));
  }
}

function setHidden(element, hidden) {
  console.log('setHidden', element, hidden);
  if(hidden) {
    element.classList.add('hidden')
  } else {
    element.classList.remove('hidden')
  }
}

function setView(viewId, fallback = initialViewId) {
  let viewWasSet = false;
  for(const e of viewElements) {
    setHidden(e, true);
  }
  for(const e of viewElements) {
    if(e.id === viewId) {
      prevViewId = currentViewId;
      currentViewId = viewId;
      setHidden(e, false);
      viewWasSet = true;
    } 
  }
  if(!viewWasSet && fallback) {
    setView(fallback, false);
  }
}


function toggleView(viewId) {
  if(viewId === currentViewId) {
    setView(prevViewId, currentViewId);
  } else {
    setView(viewId, currentViewId)
  }
}

function toggleMenu() {
  toggleView('menu');
}

function toggleResponsiveLayout() {
  if(responsiveLayout) {
    responsiveElements.foreach(e => e.classList.remove('responsive'))
  } else {
    responsiveElements.foreach(e => e.classList.add('responsive'))
  }
}



function init() {
  responsiveElements = responsiveIds.map(id => document.getElementById(id));
  viewElements = viewIds.map(id => document.getElementById(id));
  prevViewId
    = currentViewId
    = initialViewId
    = viewElements.find(e => !e.classList.contains('hidden')).id;
  setResponsive(true);
  menuView = document.getElementById("menu");
  completions = document.getElementById("completions");
  appStatus = document.getElementById('app-status');
  appContent = document.getElementById('app-content');
  answerDatalist = document.getElementById('answer-datalist');
  completionTypeCheckbox = document.getElementById('completion-type-checkbox');
  responsiveCheckbox = document.getElementById('responsive-checkbox');
  answerInput = document.getElementById("answer-input");
  nickInput = document.getElementById('nickname-input');
  initCompletion();
  run();
}


async function run() {
  while(true) {
    await fetch('next')
      .then(getJson)
      .then(doStuff)
      .catch(async error => {
        reportError(error, 'Something went wrong');
        await sleep(1000);
      });
    await sleep(100);
  }
}


document.addEventListener('DOMContentLoaded', function() {
  init();
});
