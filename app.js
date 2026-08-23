// REPLACE WITH YOUR ACTUAL API KEY (AIzaSy...)
const GEMINI_API_KEY = "AQ.Ab8RN6IFRuIJQNLEqZBqPRjy2NIP9f2nWu5v803yo_HwlslROA";

// Graph Data Stores
let nodes = [];
let links = [];

const categoryColors = d3.scaleOrdinal()
    .domain(["Core Concepts", "Mechanisms", "Applications", "Sub-Categories"])
    .range(["rgba(59, 130, 246, 0.15)", "rgba(245, 158, 11, 0.15)", "rgba(16, 185, 129, 0.15)", "rgba(139, 92, 246, 0.15)"]);

const categoryBorderColors = d3.scaleOrdinal()
    .domain(["Core Concepts", "Mechanisms", "Applications", "Sub-Categories"])
    .range(["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6"]);

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

// Initialize Force Simulation with distance-multiplier evaluation
const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(link => {
            const baseDist = link.type === 'correlation' ? 180 : 120;
            const targetMultiplier = typeof link.target === 'object' ? link.target.distanceMultiplier : 1.0;
            return baseDist * (targetMultiplier || 1.0);
        }))
    .force('charge', d3.forceManyBody().strength(-1000))
    .force('collide', d3.forceCollide().radius(120))
    .force('center', d3.forceCenter(0, 0).strength(0.05))
    .on('tick', ticked);

function getHullPath(groupNodes) {
    const points = [];
    const padding = 50;

    groupNodes.forEach(d => {
        if (d.x === undefined || d.y === undefined) return;
        points.push([d.x - 80 - padding, d.y - 30 - padding]);
        points.push([d.x + 80 + padding, d.y - 30 - padding]);
        points.push([d.x + 80 + padding, d.y + 30 + padding]);
        points.push([d.x - 80 - padding, d.y + 30 + padding]);
    });

    const hullPoints = d3.polygonHull(points);
    if (!hullPoints || hullPoints.length === 0) return '';
    return "M" + hullPoints.map(p => p.join(",")).join("L") + "Z";
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

    linksLayer.selectAll('text.link-label')
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

    nodesLayer.selectAll('g.node-group')
        .attr('transform', d => `translate(${d.x}, ${d.y})`);

    updateHulls();
}

function updateSimulation() {
    // 1. Update Links
    const linkSelection = linksLayer.selectAll('g.link-group')
        .data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

    const linkEnter = linkSelection.enter().append('g').attr('class', 'link-group');

    linkEnter.append('line')
        .attr('class', d => d.type === 'correlation' ? 'link-correlation' : 'link-precursor');

    linkEnter.filter(d => d.relationship)
        .append('text')
        .attr('class', 'link-label')
        .text(d => d.relationship);

    linkSelection.exit().remove();

    // 2. Update Nodes using .join()
    const nodeSelection = nodesLayer.selectAll('g.node-group')
        .data(nodes, d => d.id);

    nodeSelection.join(
        enter => {
            const nodeEnter = enter.append('g')
                .attr('class', 'node-group')
                .attr('data-type', d => d.nodeType)
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
                .text(d => {
                    const text = d.def || '';
                    return text.length > 22 ? text.substring(0, 20) + '...' : text;
                });

            return nodeEnter;
        },
        update => update,
        exit => exit.remove()
    );

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
            if (d.id !== 'root') {
                d.fx = null; d.fy = null;
            }
        });
}

// Drawer & Processing Actions
const drawer = document.getElementById('input-drawer');
const toggleBtn = document.getElementById('toggle-input-btn');
const closeBtn = document.getElementById('close-drawer-btn');
const processBtn = document.getElementById('process-notes-btn');
const statusSpan = document.getElementById('status');

toggleBtn.addEventListener('click', () => drawer.classList.remove('hidden'));
closeBtn.addEventListener('click', () => drawer.classList.add('hidden'));

function initializeRoot(rootLabel) {
    nodes = [{
        id: 'root',
        label: rootLabel.toUpperCase(),
        category: 'Core Concepts',
        nodeType: 'sub-branch',
        def: 'Central Branch',
        distanceMultiplier: 1.0,
        x: 0,
        y: 0,
        fx: 0,
        fy: 0
    }];
    links = [];
    updateSimulation();
}

async function processSourceMaterial() {
    const rawText = document.getElementById('notes-textarea').value.trim();
    const rootLabel = document.getElementById('root-topic-input').value.trim() || "CAPSULES";

    if (!rawText) {
        alert("Please paste study material to process.");
        return;
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("YOUR_VALID")) {
        statusSpan.textContent = "Status: Set a valid GEMINI_API_KEY in app.js";
        return;
    }

    statusSpan.textContent = "Status: Assessing & Structuring Material...";
    initializeRoot(rootLabel);

    const prompt = `Analyze this study material and structure it into a multi-directional concept map rooted at "${rootLabel}".

Source Material:
"${rawText}"

Formatting & Branching Rules:
1. Identify if information is a "sub-branch" (a category umbrella, e.g., "Types of Capsules") or a "detail" (definition, property, formula, e.g., "Enclosed in gelatin").
2. For "sub-branch" nodes, set "distanceMultiplier": 2.0 (creates 2x visual distance).
3. For "detail" nodes, set "distanceMultiplier": 1.0.
4. Extract relationships/correlations between concepts (e.g., comparisons like "<", ">", "precursor to", "inhibits"). Add these as cross-links in the "correlations" array.

Return ONLY a JSON array matching the required schema.`;

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            nodes: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        id: { type: "STRING" },
                                        parentId: { type: "STRING" },
                                        label: { type: "STRING" },
                                        definition: { type: "STRING" },
                                        nodeType: { type: "STRING", enum: ["sub-branch", "detail"] },
                                        category: { type: "STRING" },
                                        distanceMultiplier: { type: "NUMBER" }
                                    },
                                    required: ["id", "parentId", "label", "definition", "nodeType", "distanceMultiplier"]
                                }
                            },
                            correlations: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        sourceId: { type: "STRING" },
                                        targetId: { type: "STRING" },
                                        relationship: { type: "STRING" }
                                    },
                                    required: ["sourceId", "targetId", "relationship"]
                                }
                            }
                        },
                        required: ["nodes"]
                    }
                }
            })
        });

        const data = await response.json();
        
        if (data.error) {
            statusSpan.textContent = `Error: ${data.error.message}`;
            return;
        }

        const payload = JSON.parse(data.candidates[0].content.parts[0].text);
        const validNodeIds = new Set(['root']);

        // Register new nodes safely
        payload.nodes.forEach(item => {
            validNodeIds.add(item.id);
            nodes.push({
                id: item.id,
                label: item.label.toUpperCase(),
                category: item.category || (item.nodeType === 'sub-branch' ? 'Sub-Categories' : 'Mechanisms'),
                nodeType: item.nodeType,
                def: item.definition,
                distanceMultiplier: item.distanceMultiplier || 1.0,
                x: (Math.random() - 0.5) * 100,
                y: (Math.random() - 0.5) * 100
            });
        });

        // Link parent-child trees with fallback validation
        payload.nodes.forEach(item => {
            const sourceId = validNodeIds.has(item.parentId) ? item.parentId : 'root';
            links.push({
                source: sourceId,
                target: item.id,
                type: 'precursor'
            });
        });

        // Add correlation cross-links securely
        if (payload.correlations) {
            payload.correlations.forEach(rel => {
                if (validNodeIds.has(rel.sourceId) && validNodeIds.has(rel.targetId)) {
                    links.push({
                        source: rel.sourceId,
                        target: rel.targetId,
                        type: 'correlation',
                        relationship: rel.relationship
                    });
                }
            });
        }

        updateSimulation();
        statusSpan.textContent = "Status: Map rendered successfully.";
        drawer.classList.add('hidden');

    } catch (err) {
        console.error("API Processing Error:", err);
        statusSpan.textContent = `Status: Parsing failed (${err.message})`;
    }
}

processBtn.addEventListener('click', processSourceMaterial);

document.getElementById('export-btn').addEventListener('click', () => {
    const exportData = { nodes, links };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "concept_map.json");
    document.body.appendChild(a);
    a.click();
    a.remove();
});

// Default canvas load
initializeRoot("CAPSULES");
