
const fetch = require('node-fetch');

async function listModels() {
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        const data = await response.json();
        console.log('Available models:', data.models.map(m => m.name));
    } catch (e) {
        console.error('Error fetching models:', e.message);
    }
}

listModels();
