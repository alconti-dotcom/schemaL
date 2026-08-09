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

// Center initial view
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
        id: 'node_' + Date.now(),
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

    let processedPhrases = new Set();

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

function processSpeechText(text) {
    const lower = text.toLowerCase();
    
    // Prevent duplicate triggers on the same spoken sentence
    if (processedPhrases.has(lower)) return;
    processedPhrases.add(lower);

    // Dynamic Trigger Patterns: "X is Y", "X means Y", "X leads to Y", or "X defined as Y"
    let parent = 'Main Subject';
    let child = '';
    let def = text;
    let category = 'Mechanisms';
    let isCorrelation = false;

    if (lower.includes(' leads to ') || lower.includes(' causes ')) {
        const parts = lower.split(/ leads to | causes /);
        parent = parts[0].trim().toUpperCase();
        child = parts[1].trim().toUpperCase();
        isCorrelation = true;
    } else if (lower.includes(' is ') || lower.includes(' means ') || lower.includes(' defined as ')) {
        const parts = lower.split(/ is | means | defined as /);
        child = parts[0].trim().toUpperCase();
        def = parts[1].trim();
        category = 'Core Concepts';
    } else {
        // Fallback: If any long sentence is finalized, branch off the last node created
        const lastNode = nodes[nodes.length - 1] ? nodes[nodes.length - 1].label : 'Main Subject';
        const words = text.split(' ');
        child = words.slice(0, 3).join(' ').toUpperCase(); // Take first 3 words as label
        parent = lastNode;
        category = 'Applications';
    }

    if (child && child.length > 1) {
        // Ensure parent exists, fallback to root if not found
        const parentExists = nodes.some(n => n.label.toLowerCase() === parent.toLowerCase());
        const validParent = parentExists ? parent : 'Main Subject';

        addNode(validParent, child, def, category, isCorrelation);
    }
}
} else {
    statusSpan.textContent = 'Status: Web Speech API unsupported in browser.';
}

// --- Manual Concept Addition & Export ---
document.getElementById('add-demo-btn').addEventListener('click', () => {
    const categories = ['Core Concepts', 'Mechanisms', 'Applications'];
    const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
    const parent = nodes[Math.floor(Math.random() * nodes.length)].label;
    const count = nodes.length;

    addNode(parent, `Concept ${count}`, 'Automated multidirectional node', selectedCategory, Math.random() > 0.6);
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
