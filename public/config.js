

function fetchJsonData() {
  fetch('configuration')
  .then(response => response.json())
  .then(jsonData => {
    document.getElementById('json-area').value = JSON.stringify(jsonData, null, 2);
  })
  .catch(error => console.error('Error fetching JSON:', error));
}


function submitJsonData(immediate = false) {
  const data = {
      config: JSON.parse(document.getElementById('json-area').value),
      immediate
  };
  fetch('configuration', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => {
    if (response.ok) {
      window.location.reload();
    } else {
      throw new Error('Failed to submit JSON data');
    }
  })
  .catch(error => console.error('Error submitting JSON data:', error));
}
