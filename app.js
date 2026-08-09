// --- CONFIGURATION: Paste your Google AI Studio API key below ---
const AI_API_KEY = AQ.Ab8RN6JYvQejeWQyctAnMO1pDV-jrTzZsVx8wYdD1uDkMy8NZA;

// --- Data State ---
const nodes = [
    { id: 'root', label: 'Main Subject', category: 'Core Concepts', def: 'Central topic of lecture' }
];
const links = [];

// Color Palettes for Categorical Clusters
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

// --- D3 SVG Selection & Infinite Canvas Pan/Zoom ---
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

// --- D3 Force Physics Engine ---
const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(d => d.type === 'correlation' ? 220 : 150))
    .force('charge', d3.forceManyBody().strength(-900))
    .force('collide', d3.forceCollide().radius(110))
    .force('clusterX', d3.forceX(d => clusterCenters[d.category]?.x || 0).strength(0.15))
    .force('clusterY', d3.forceY(d => clusterCenters[d.category]?.y || 0).strength(0.15))
    .on('tick', ticked);

// --- Convex Hull Polygon Computation ---
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

// --- Frame Render Function ---
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

// --- Node Management & Dynamic Data Binding ---
function updateSimulation() {
    // 1. Render Links
    const linkSelection = linksLayer.selectAll('line')
        .data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

    linkSelection.join('line')
        .attr('class', d => d.type === 'correlation' ? 'link-correlation' : 'link-precursor');

    // 2. Render Nodes
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

// Interactive Node Dragging
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
    let parentNode = nodes.find(n => n.label.toLowerCase() === parentLabel.toLowerCase()) || nodes[0];

    const newNode = {
        id: 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
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

// --- Speech Buffer & Gemini AI Concept Parser ---
let speechBuffer = "";

async function processSpeechText(text) {
    speechBuffer += " " + text;
    
    // Process when a chunk reaches ~15 words
    if (speechBuffer.trim().split(/\s+/).length < 15) return;

    const chunkToProcess = speechBuffer;
    speechBuffer = ""; // Reset buffer

    if (!AI_API_KEY || AI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
        statusSpan.textContent = "Status: Error - API Key missing in app.js";
        return;
    }

    try {
        statusSpan.textContent = "Status: AI Parsing schema...";

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${AI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Extract structural concepts from this lecture transcript segment into valid JSON.
                        
Transcript: "${chunkToProcess}"

Existing concepts on canvas: ${JSON.stringify(nodes.map(n => n.label))}

Rules:
1. Extract true core academic or technical concepts. Do NOT capture conversational filler words.
2. Set 'parentLabel' to the most logically related existing concept or 'Main Subject'.
3. Set 'category' strictly to one of: 'Core Concepts', 'Mechanisms', 'Applications'.
4. 'definition' must be a concise, 1-sentence summary of the concept.

Return ONLY a valid JSON array matching this exact schema:
[
  {
    "parentLabel": "string",
    "childLabel": "string",
    "definition": "string",
    "category": "Core Concepts" | "Mechanisms" | "Applications",
    "isCorrelation": false
  }
]`
                    }]
                }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        const extractedNodes = JSON.parse(data.candidates[0].content.parts[0].text);

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
        console.error("AI Parsing Error:", err);
        statusSpan.textContent = "Status: Listening (AI Parse Error)";
    }
}

// --- Speech Recognition Engine ---
const listenBtn = document.getElementById('listen-btn');
const statusSpan = document.getElementById('status');
const preview = document.getElementById('transcript-preview');

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
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                const finalPhrase = event.results[i][0].transcript.trim();
                preview.textContent = finalPhrase;
                processSpeechText(finalPhrase);
            } else {
                currentTranscript += event.results[i][0].transcript;
                preview.textContent = currentTranscript;
            }
        }
    };
} else {
    statusSpan.textContent = 'Status: Web Speech API unsupported in browser.';
}

// --- Manual Concept Addition & Export ---
document.getElementById('add-demo-btn').addEventListener('click', () => {
    const term = prompt("Enter Concept Name (e.g., PHOTOSYNTHESIS):");
    if (!term) return;
    
    const parent = prompt("Parent Concept (leave blank for Main Subject):") || "Main Subject";
    const def = prompt("Short Definition:") || "Manually added concept";
    const category = prompt("Category (Core Concepts / Mechanisms / Applications):") || "Mechanisms";

    addNode(parent, term.toUpperCase(), def, category, false);
});

document.getElementById('export-btn').addEventListener('click', () => {
    const exportData = { nodes, links: links.map(l => ({ source: l.source.id, target: l.target.id, type: l.type })) };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "lecture_schema.json");
    document.body.appendChild(a);
    a.click();
    a.remove();
});

// Initial Setup
updateSimulation();
