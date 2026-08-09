const GEMINI_API_KEY = "AQ.Ab8RN6JYvQejeWQyctAnMO1pDV-jrTzZsVx8wYdD1uDkMy8NZA"; 

const nodes = [
    { id: 'root', label: 'Main Subject', category: 'Core Concepts', def: 'Central topic of lecture' }
];
const links = [];

const categoryColors = d3.scaleOrdinal()
    .domain(["Core Concepts", "Mechanisms", "Applications"])
    .range(["rgba(59, 130, 246, 0.15)", "rgba(245, 158, 11, 0.15)", "rgba(16, 185, 129, 0.15)"]);

const categoryBorderColors = d3.scaleOrdinal()
    .domain(["Core Concepts", "Mechanisms", "Applications"])
    .range(["#3b82f6", "#f59e0b", "#10b981"]);

const clusterCenters = {
    "Core Concepts": { x: 0, y: 0 },
    "Mechanisms":    { x: 300, y: -200 },
    "Applications":  { x: 300, y: 200 }
};

const svg = d3.select('#canvas-container');
const viewport = d3.select('#viewport');
const hullsLayer = d3.select('#hulls-layer');
const linksLayer = d3.select('#links-layer');
const nodesLayer = d3.select('#nodes-layer');

const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => viewport.attr('transform', event.transform));

svg.call(zoom);
svg.call(zoom.transform, d3.zoomIdentity.translate(window.innerWidth / 2, window.innerHeight / 2));

const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(d => d.type === 'correlation' ? 220 : 150))
    .force('charge', d3.forceManyBody().strength(-900))
    .force('collide', d3.forceCollide().radius(110))
    .force('clusterX', d3.forceX(d => clusterCenters[d.category]?.x || 0).strength(0.15))
    .force('clusterY', d3.forceY(d => clusterCenters[d.category]?.y || 0).strength(0.15))
    .on('tick', ticked);

function getHullPath(groupNodes) {
    const points = [];
    const padding = 45;

    groupNodes.forEach(d => {
        points.push([d.x - 80 - padding, d.y - 30 - padding]);
        points.push([d.x + 80 + padding, d.y - 30 - padding]);
        points.push([d.x + 80 + padding, d.y + 30 + padding]);
        points.push([d.x - 80 - padding, d.y + 30 + padding]);
    });

    const hullPoints = d3.polygonHull(points);
    if (!hullPoints) return '';
    return "M" + hullPoints.join("L") + "Z";
}

function updateHulls() {
    const categories = Array.from(d3.group(nodes, d => d.category));

    const hullSelection = hullsLayer.selectAll('path.hull')
        .data(categories, d => d[0]);

    hullSelection.join('path')
        .attr('class', 'hull')
        .attr('d', d => getHullPath(d[1]))
        .attr('fill', d => categoryColors(d[0]))
        .attr('stroke', d => categoryBorderColors(d[0]))
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5,5');
}

function ticked() {
    linksLayer.selectAll('line')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

    nodesLayer.selectAll('g.node-group')
        .attr('transform', d => `translate(${d.x}, ${d.y})`);

    updateHulls();
}

function updateSimulation() {
    const linkSelection = linksLayer.selectAll('line')
        .data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

    linkSelection.join('line')
        .attr('class', d => d.type === 'correlation' ? 'link-correlation' : 'link-precursor');

    const nodeSelection = nodesLayer.selectAll('g.node-group')
        .data(nodes, d => d.id);

    const nodeEnter = nodeSelection.enter()
        .append('g')
        .attr('class', 'node-group')
        .call(drag(simulation));

    nodeEnter.append('rect')
        .attr('class', 'node-rect')
        .attr('width', 160)
        .attr('height', 60)
        .attr('x', -80)
        .attr('y', -30);

    nodeEnter.append('text')
        .attr('class', 'node-title')
        .attr('x', -70)
        .attr('y', -8)
        .text(d => d.label);

    nodeEnter.append('text')
        .attr('class', 'node-def')
        .attr('x', -70)
        .attr('y', 12)
        .text(d => d.def.length > 22 ? d.def.substring(0, 20) + '...' : d.def);

    simulation.nodes(nodes);
    simulation.force('link').links(links);
    simulation.alpha(0.8).restart();
}

function drag(sim) {
    return d3.drag()
        .on('start', (e, d) => {
            if (!e.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (e, d) => {
            d.fx = e.x; d.fy = e.y;
        })
        .on('end', (e, d) => {
            if (!e.active) sim.alphaTarget(0);
            d.fx = null; d.fy = null;
        });
}

function addNode(parentLabel, childLabel, definition = '', category = 'Mechanisms', isCorrelation = false) {
    if (nodes.some(n => n.label.toLowerCase() === childLabel.toLowerCase())) return;

    let parentNode = nodes.find(n => n.label.toLowerCase() === parentLabel.toLowerCase()) || nodes[0];

    const newNode = {
        id: 'node_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        label: childLabel,
        category: category,
        def: definition,
        x: parentNode.x + (Math.random() - 0.5) * 40,
        y: parentNode.y + (Math.random() - 0.5) * 40
    };

    nodes.push(newNode);
    links.push({
        source: parentNode.id,
        target: newNode.id,
        type: isCorrelation ? 'correlation' : 'precursor'
    });

    updateSimulation();
}

const listenBtn = document.getElementById('listen-btn');
const statusSpan = document.getElementById('status');
const preview = document.getElementById('transcript-preview');

let speechBuffer = "";

async function processSpeechWithAI(transcriptChunk) {
    speechBuffer += " " + transcriptChunk;
    
    if (speechBuffer.trim().split(/\s+/).length < 12) return;

    const textToProcess = speechBuffer;
    speechBuffer = "";

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
        statusSpan.textContent = "Status: Error - Set your Gemini API key in app.js";
        return;
    }

    try {
        statusSpan.textContent = "Status: AI parsing concepts...";

        const prompt = `You are a real-time academic lecture parser. Extract distinct entities and relationships from this transcript fragment.

Transcript: "${textToProcess}"

Existing Canvas Concepts: ${JSON.stringify(nodes.map(n => n.label))}

Instructions:
1. Extract true core technical/academic concepts (ignore conversational filler).
2. Connect new concepts to an existing logical parent concept from the provided list, or "Main Subject".
3. Categorize into one of: "Core Concepts", "Mechanisms", "Applications".
4. Provide a clear, concise 1-sentence definition.

Return ONLY a valid JSON array of objects with this schema:
[
  {
    "parentLabel": "string",
    "childLabel": "string",
    "definition": "string",
    "category": "Core Concepts" | "Mechanisms" | "Applications",
    "isCorrelation": boolean
  }
]`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        const extractedNodes = JSON.parse(responseText);

        extractedNodes.forEach(item => {
            if (item.childLabel && item.childLabel.length > 1) {
                addNode(
                    item.parentLabel || "Main Subject",
                    item.childLabel.toUpperCase(),
                    item.definition || "",
                    item.category || "Mechanisms",
                    item.isCorrelation || false
                );
            }
        });

        statusSpan.textContent = "Status: Listening...";
    } catch (err) {
        console.error("Gemini API Error:", err);
        statusSpan.textContent = "Status: Listening (AI parse skipped)";
    }
}

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    let isListening = false;

    listenBtn.addEventListener('click', () => {
        if (!isListening) {
            recognition.start();
            listenBtn.classList.add('recording');
            listenBtn.textContent = 'Stop Listening';
            statusSpan.textContent = 'Status: Listening audio stream...';
            isListening = true;
        } else {
            recognition.stop();
            listenBtn.classList.remove('recording');
            listenBtn.textContent = 'Start Listening';
            statusSpan.textContent = 'Status: Idle';
            isListening = false;
        }
    });

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                const finalChunk = event.results[i][0].transcript;
                preview.textContent = finalChunk;
                processSpeechWithAI(finalChunk);
            } else {
                interimTranscript += event.results[i][0].transcript;
                preview.textContent = interimTranscript;
            }
        }
    };
} else {
    statusSpan.textContent = 'Status: Web Speech API unsupported in browser.';
}

document.getElementById('add-demo-btn').addEventListener('click', () => {
    const term = prompt("Enter Concept Name (e.g., PHOTOSYNTHESIS):");
    if (!term) return;
    
    const parent = prompt("Parent Concept (or leave blank for Main Subject):") || "Main Subject";
    const def = prompt("Short Definition:") || "";
    const category = prompt("Category (Core Concepts / Mechanisms / Applications):") || "Mechanisms";

    addNode(parent, term.toUpperCase(), def, category, false);
});

document.getElementById('export-btn').addEventListener('click', () => {
    const exportData = { 
        nodes: nodes.map(n => ({ id: n.id, label: n.label, category: n.category, def: n.def })), 
        links: links.map(l => ({ source: l.source.id || l.source, target: l.target.id || l.target, type: l.type })) 
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "lecture_schema.json");
    document.body.appendChild(a);
    a.click();
    a.remove();
});

updateSimulation();
