import * as THREE from './vendor/three.module.js';

const COLORS = {
	green: 0x20f6a7,
	cyan: 0x27cfff,
	violet: 0xa969ff,
	amber: 0xf2b84b,
	white: 0xe8f6ff,
	muted: 0x486b82,
	deep: 0x071521,
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isSmallViewport = () => window.matchMedia('(max-width: 720px)').matches;

function setLiveTimes() {
	const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	document.querySelectorAll('[data-live-time]').forEach((node) => { node.textContent = time; });
}

function seededRandom(seed) {
	let value = seed >>> 0;
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0;
		return value / 4294967296;
	};
}

function basicMaterial(color, opacity = 1, options = {}) {
	return new THREE.MeshBasicMaterial({
		color,
		transparent: opacity < 1,
		opacity,
		depthWrite: false,
		blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
		side: options.side || THREE.FrontSide,
	});
}

function lineMaterial(color, opacity = 1, additive = true) {
	return new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity,
		depthWrite: false,
		blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
	});
}

function addLine(parent, points, color, opacity = 0.5, additive = true) {
	const geometry = new THREE.BufferGeometry().setFromPoints(points);
	const line = new THREE.Line(geometry, lineMaterial(color, opacity, additive));
	parent.add(line);
	return line;
}

function addCurve(parent, points, color, opacity = 0.65, closed = false) {
	const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal', 0.35);
	const line = addLine(parent, curve.getPoints(closed ? 48 : 64), color, opacity, true);
	return { curve, line };
}

function addPointCloud(parent, count, spread, depth, size, opacity, seed, colorBias = 0) {
	const random = seededRandom(seed);
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const palette = [new THREE.Color(COLORS.cyan), new THREE.Color(COLORS.green), new THREE.Color(COLORS.violet)];
	for (let i = 0; i < count; i += 1) {
		const depthBias = (random() - 0.5) * depth;
		positions[i * 3] = (random() - 0.5) * spread;
		positions[i * 3 + 1] = (random() - 0.5) * spread * 0.52;
		positions[i * 3 + 2] = depthBias - 1.6;
		const color = palette[(i + colorBias) % palette.length];
		colors[i * 3] = color.r;
		colors[i * 3 + 1] = color.g;
		colors[i * 3 + 2] = color.b;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	const material = new THREE.PointsMaterial({
		size,
		vertexColors: true,
		transparent: true,
		opacity,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		sizeAttenuation: true,
	});
	const points = new THREE.Points(geometry, material);
	parent.add(points);
	return points;
}

function addBackdrop(scene, small) {
	const backdrop = new THREE.Group();
	backdrop.position.z = -0.35;
	scene.add(backdrop);
	addPointCloud(backdrop, small ? 54 : 118, 12, 8, small ? 0.018 : 0.024, 0.33, 19);
	addPointCloud(backdrop, small ? 14 : 23, 7, 4, small ? 0.035 : 0.045, 0.52, 71, 1);
	addPointCloud(backdrop, small ? 4 : 9, 5, 2, small ? 0.07 : 0.085, 0.78, 113, 2);

	const grid = new THREE.GridHelper(12, 18, COLORS.cyan, COLORS.cyan);
	grid.position.set(0, -2.12, -1.35);
	grid.material.transparent = true;
	grid.material.opacity = small ? 0.022 : 0.045;
	grid.material.depthWrite = false;
	grid.material.blending = THREE.AdditiveBlending;
	backdrop.add(grid);
	addLine(backdrop, [new THREE.Vector3(-6, -1.98, -1.32), new THREE.Vector3(6, -1.98, -1.32)], COLORS.cyan, 0.1);
	return backdrop;
}

function addGlowNode(parent, position, color, size = 0.11, emphasis = 1, label = '') {
	const node = new THREE.Group();
	node.position.copy(position);
	node.userData.baseScale = 1;
	node.userData.phase = position.x * 0.7 + position.y * 0.45 + position.z * 0.21;
	node.userData.emphasis = emphasis;
	node.userData.label = label;

	const halo = new THREE.Mesh(
		new THREE.SphereGeometry(size * (2.7 + emphasis * 0.65), 12, 8),
		basicMaterial(color, 0.055 + emphasis * 0.018, { additive: true })
	);
	const shell = new THREE.Mesh(
		new THREE.SphereGeometry(size * 1.55, 12, 8),
		basicMaterial(color, 0.2 + emphasis * 0.045, { additive: true })
	);
	const core = new THREE.Mesh(
		new THREE.SphereGeometry(size * (0.62 + emphasis * 0.13), 12, 8),
		basicMaterial(color, 0.92, { additive: true })
	);
	node.add(halo, shell, core);
	parent.add(node);
	return node;
}

function trackBreathing(graph, node, amount = 0.04) {
	graph.userData.breathing.push({ node, amount, phase: node.userData.phase || 0 });
}

function addPartialArc(parent, options) {
	const {
		radius = 1.5,
		start = -1,
		end = 2.6,
		yScale = 0.42,
		depth = 0.12,
		tilt = 0,
		color = COLORS.cyan,
		opacity = 0.55,
	} = options;
	const points = [];
	const segments = 42;
	for (let i = 0; i <= segments; i += 1) {
		const t = i / segments;
		const angle = start + (end - start) * t;
		points.push(new THREE.Vector3(
			Math.cos(angle) * radius,
			Math.sin(angle) * radius * yScale,
			Math.sin(angle * 1.65) * depth
		));
	}
	const group = new THREE.Group();
	group.rotation.set(tilt, options.yaw || 0, options.roll || 0);
	const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.25);
	const line = addLine(group, curve.getPoints(56), color, opacity, true);
	parent.add(group);
	return { group, curve, line };
}

function addPulse(graph, parent, curve, color, speed = 0.08, size = 0.045, phase = 0) {
	const mesh = addGlowNode(parent, new THREE.Vector3(), color, size, 0.65);
	graph.userData.pulses.push({ mesh, curve, speed, phase });
	return mesh;
}

function addBoxBoundary(parent, size, position, color, opacity = 0.06, rotation = [0, 0, 0]) {
	const group = new THREE.Group();
	group.position.set(...position);
	group.rotation.set(...rotation);
	const volume = new THREE.Mesh(
		new THREE.BoxGeometry(...size),
		basicMaterial(color, opacity, { additive: true, side: THREE.DoubleSide })
	);
	const edges = new THREE.LineSegments(
		new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)),
		lineMaterial(color, Math.min(opacity * 5.2, 0.42), true)
	);
	group.add(volume, edges);
	parent.add(group);
	return group;
}

function addVerificationRing(parent, radius, color, position, rotation, opacity = 0.46) {
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(radius, 0.012, 8, 72),
		basicMaterial(color, opacity, { additive: true })
	);
	ring.position.set(...position);
	ring.rotation.set(...rotation);
	parent.add(ring);
	return ring;
}

function addCheckMark(parent, color, z = 0) {
	const mark = addLine(parent, [
		new THREE.Vector3(-0.18, -0.02, z),
		new THREE.Vector3(-0.05, -0.17, z),
		new THREE.Vector3(0.22, 0.19, z),
	], color, 0.88, true);
	mark.scale.setScalar(0.8);
	return mark;
}

function buildHub(graph, small) {
	const plane = new THREE.Group();
	plane.scale.setScalar(small ? 1.02 : 1.42);
	plane.position.set(0.06, 0.02, 0.1);
	graph.add(plane);

	const core = new THREE.Group();
	const shell = new THREE.Mesh(
		new THREE.IcosahedronGeometry(0.82, 1),
		basicMaterial(COLORS.deep, 0.72, { additive: false, side: THREE.DoubleSide })
	);
	const shellEdges = new THREE.LineSegments(
		new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.82, 1)),
		lineMaterial(COLORS.cyan, 0.2, true)
	);
	const inner = new THREE.Mesh(
		new THREE.OctahedronGeometry(0.23, 1),
		basicMaterial(COLORS.green, 0.86, { additive: true })
	);
	const innerHalo = new THREE.Mesh(
		new THREE.SphereGeometry(0.43, 16, 10),
		basicMaterial(COLORS.green, 0.045, { additive: true })
	);
	core.add(shell, shellEdges, innerHalo, inner);
	plane.add(core);
	trackBreathing(graph, inner, 0.055);

	const arcs = [
		addPartialArc(plane, { radius: 1.3, start: -2.45, end: 0.5, yScale: 0.38, depth: 0.28, tilt: 0.28, yaw: -0.16, color: COLORS.green, opacity: 0.72 }),
		addPartialArc(plane, { radius: 1.5, start: -0.25, end: 2.48, yScale: 0.32, depth: 0.34, tilt: -0.33, yaw: 0.19, color: COLORS.cyan, opacity: 0.63 }),
		addPartialArc(plane, { radius: 1.04, start: 1.3, end: 4.22, yScale: 0.5, depth: 0.22, tilt: 0.7, yaw: -0.42, color: COLORS.violet, opacity: 0.48 }),
		addPartialArc(plane, { radius: 1.72, start: 2.52, end: 5.42, yScale: 0.25, depth: 0.45, tilt: -0.12, yaw: 0.53, color: COLORS.green, opacity: 0.34 }),
	];
	const nodes = [
		[-1.23, 0.36, 0.18, COLORS.green, 0.11, 1.2],
		[-0.6, 0.79, -0.18, COLORS.cyan, 0.065, 0.8],
		[0.98, 0.42, 0.62, COLORS.violet, 0.08, 1],
		[1.46, -0.43, -0.18, COLORS.cyan, 0.125, 1.3],
		[0.38, -0.8, 0.54, COLORS.green, 0.07, 0.9],
		[-1.48, -0.56, -0.34, COLORS.white, 0.055, 0.75],
		[1.84, 0.93, -0.35, COLORS.green, 0.05, 0.75],
	];
	nodes.forEach(([x, y, z, color, size, emphasis], index) => {
		const node = addGlowNode(plane, new THREE.Vector3(x, y, z), color, size, emphasis);
		trackBreathing(graph, node, index === 0 || index === 3 ? 0.07 : 0.035);
	});
	addPulse(graph, arcs[0].group, arcs[0].curve, COLORS.green, 0.026, 0.052, 0.1);
	addPulse(graph, arcs[1].group, arcs[1].curve, COLORS.cyan, 0.021, 0.043, 0.58);
	const telemetry = addGlowNode(plane, new THREE.Vector3(-1.72, 1.18, 0.72), COLORS.white, 0.035, 0.65);
	trackBreathing(graph, telemetry, 0.04);

	graph.userData.update = (elapsed) => {
		core.rotation.y = elapsed * 0.026;
		core.rotation.x = Math.sin(elapsed * 0.021) * 0.08;
		arcs.forEach((arc, index) => {
			arc.group.rotation.z += Math.sin(elapsed * 0.024 + index) * 0.00008;
		});
	};
}

function buildCareer(graph, small) {
	const constellation = new THREE.Group();
	const scale = small ? 0.96 : 1.38;
	constellation.scale.setScalar(scale);
	constellation.position.set(0, 0.02, 0.12);
	graph.add(constellation);

	const main = addCurve(constellation, [
		new THREE.Vector3(-2.05, -1.08, 0.28),
		new THREE.Vector3(-1.18, -0.7, 0.16),
		new THREE.Vector3(-0.38, -0.22, 0.45),
		new THREE.Vector3(0.56, 0.42, 0.65),
		new THREE.Vector3(1.72, 1.05, 0.42),
	], COLORS.green, 0.78);
	const branch = addCurve(constellation, [
		new THREE.Vector3(-0.38, -0.22, 0.45),
		new THREE.Vector3(-0.06, 0.18, -0.34),
		new THREE.Vector3(0.22, 0.88, -0.08),
		new THREE.Vector3(0.84, 1.28, 0.36),
	], COLORS.cyan, 0.58);
	const education = addCurve(constellation, [
		new THREE.Vector3(0.56, 0.42, 0.65),
		new THREE.Vector3(0.92, 0.06, 0.03),
		new THREE.Vector3(1.36, -0.26, -0.42),
	], COLORS.violet, 0.45);

	const huawei = addGlowNode(constellation, new THREE.Vector3(-1.95, -1.06, 0.32), COLORS.green, 0.19, 1.45, 'Huawei');
	const okx = addGlowNode(constellation, new THREE.Vector3(0.55, 0.41, 0.7), COLORS.cyan, 0.145, 1.2, 'OKX');
	const educationNodes = [
		[new THREE.Vector3(-0.4, -0.2, 0.48), COLORS.cyan, 0.085],
		[new THREE.Vector3(0.22, 0.89, -0.02), COLORS.violet, 0.105],
		[new THREE.Vector3(0.84, 1.28, 0.36), COLORS.white, 0.068],
		[new THREE.Vector3(1.37, -0.26, -0.45), COLORS.violet, 0.078],
		[new THREE.Vector3(1.74, 1.06, 0.42), COLORS.green, 0.055],
	];
	educationNodes.forEach(([position, color, size], index) => {
		const node = addGlowNode(constellation, position, color, size, index === 1 ? 1.05 : 0.75);
		trackBreathing(graph, node, index === 1 ? 0.065 : 0.035);
	});
	trackBreathing(graph, huawei, 0.07);
	trackBreathing(graph, okx, 0.06);
	addPulse(graph, constellation, main.curve, COLORS.green, 0.018, 0.052, 0.05);
	addPulse(graph, constellation, branch.curve, COLORS.cyan, 0.014, 0.04, 0.64);
	addPulse(graph, constellation, education.curve, COLORS.violet, 0.012, 0.035, 0.32);
	addLine(constellation, [
		new THREE.Vector3(-2.2, -1.3, -0.62),
		new THREE.Vector3(1.95, 1.42, -0.62),
	], COLORS.muted, 0.1);

	graph.userData.update = (elapsed) => {
		constellation.position.y = 0.02 + Math.sin(elapsed * 0.035) * 0.018;
		constellation.rotation.z = Math.sin(elapsed * 0.022) * 0.006;
	};
}

function buildProjects(graph, small) {
	const topology = new THREE.Group();
	topology.scale.setScalar(small ? 0.95 : 1.3);
	topology.position.set(0, -0.02, 0.16);
	graph.add(topology);
	const pivot = new THREE.Group();
	topology.add(pivot);

	const boundaryA = addBoxBoundary(pivot, [2.75, 1.72, 1.82], [-0.62, 0.05, 0.15], COLORS.cyan, 0.045, [0.03, -0.12, 0.02]);
	const boundaryB = addBoxBoundary(pivot, [1.62, 1.22, 1.35], [0.95, 0.43, -0.48], COLORS.violet, 0.04, [-0.08, 0.2, -0.04]);
	const boundaryC = addBoxBoundary(pivot, [3.7, 0.08, 2.3], [-0.12, -0.84, -1.02], COLORS.green, 0.025, [0, 0.09, 0]);
	boundaryA.userData.kind = 'control-plane';
	boundaryB.userData.kind = 'service-plane';
	boundaryC.userData.kind = 'telemetry-plane';

	const nodes = {
		api: addGlowNode(pivot, new THREE.Vector3(-1.5, 0.32, 0.55), COLORS.cyan, 0.14, 1.25),
		worker: addGlowNode(pivot, new THREE.Vector3(-0.58, -0.06, 0.18), COLORS.green, 0.12, 1.2),
		db: addGlowNode(pivot, new THREE.Vector3(0.18, -0.42, 0.62), COLORS.violet, 0.1, 0.95),
		control: addGlowNode(pivot, new THREE.Vector3(0.72, 0.62, -0.25), COLORS.cyan, 0.16, 1.3),
		cloud: addGlowNode(pivot, new THREE.Vector3(1.68, 0.95, 0.78), COLORS.green, 0.115, 1.05),
		telemetry: addGlowNode(pivot, new THREE.Vector3(1.54, -0.62, -0.62), COLORS.violet, 0.075, 0.9),
	};
	Object.values(nodes).forEach((node, index) => trackBreathing(graph, node, index === 3 ? 0.07 : 0.04));

	const links = [
		[[-1.5, 0.32, 0.55], [-0.58, -0.06, 0.18], [0.18, -0.42, 0.62]],
		[[-0.58, -0.06, 0.18], [0.72, 0.62, -0.25], [1.68, 0.95, 0.78]],
		[[0.18, -0.42, 0.62], [0.86, -0.14, 0.1], [1.54, -0.62, -0.62]],
		[[0.72, 0.62, -0.25], [1.08, 0.8, 0.55], [1.68, 0.95, 0.78]],
	];
	const linkColors = [COLORS.cyan, COLORS.green, COLORS.violet, COLORS.cyan];
	links.forEach((points, index) => {
		const route = addCurve(pivot, points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), linkColors[index], 0.5);
		addPulse(graph, pivot, route.curve, linkColors[index], 0.015 - index * 0.001, 0.04, index * 0.23);
	});
	addLine(topology, [
		new THREE.Vector3(-2.4, -1.32, -0.92),
		new THREE.Vector3(2.35, -1.32, -0.92),
	], COLORS.cyan, 0.1);

	graph.userData.update = (elapsed) => {
		pivot.rotation.y = Math.sin(elapsed * 0.045) * 0.07;
		pivot.rotation.x = Math.sin(elapsed * 0.032) * 0.035;
		topology.position.y = -0.02 + Math.sin(elapsed * 0.03) * 0.018;
	};
}

function buildVault(graph, small) {
	const trust = new THREE.Group();
	trust.scale.setScalar(small ? 0.96 : 1.32);
	trust.position.set(0, 0.02, 0.1);
	graph.add(trust);

	const outer = addBoxBoundary(trust, [2.78, 2.26, 2.1], [0, 0, -0.62], COLORS.cyan, 0.035, [0.05, -0.12, 0.02]);
	const inner = addBoxBoundary(trust, [1.68, 1.48, 1.52], [0.04, 0.03, 0.18], COLORS.green, 0.045, [-0.08, 0.18, -0.03]);
	const plane = addBoxBoundary(trust, [1.22, 0.08, 1.18], [0.02, -0.02, 0.93], COLORS.violet, 0.022, [0.02, 0.22, 0.05]);
	outer.userData.rotationSpeed = 0.004;
	inner.userData.rotationSpeed = -0.006;
	plane.userData.rotationSpeed = 0.008;

	const core = new THREE.Group();
	core.position.set(0.03, 0.02, 0.52);
	const diamond = new THREE.Mesh(
		new THREE.OctahedronGeometry(0.28, 1),
		basicMaterial(COLORS.green, 0.8, { additive: true })
	);
	const coreHalo = new THREE.Mesh(
		new THREE.SphereGeometry(0.55, 16, 10),
		basicMaterial(COLORS.cyan, 0.045, { additive: true })
	);
	core.add(coreHalo, diamond);
	trust.add(core);
	addCheckMark(core, COLORS.white, 0.32);
	trackBreathing(graph, diamond, 0.06);

	const rings = [
		addVerificationRing(trust, 0.91, COLORS.cyan, [0, -0.44, -0.42], [0.5, 0.18, 0.1], 0.5),
		addVerificationRing(trust, 0.72, COLORS.violet, [0.04, 0.02, 0.04], [1.1, -0.28, -0.35], 0.38),
		addVerificationRing(trust, 0.52, COLORS.green, [-0.02, 0.28, 0.48], [0.18, 0.72, 0.08], 0.66),
	];
	const dataNodes = [
		[-1.3, 0.78, -0.54, COLORS.cyan, 0.045],
		[1.23, 0.55, -0.1, COLORS.green, 0.055],
		[-1.1, -0.72, 0.3, COLORS.violet, 0.04],
		[1.22, -0.55, 0.66, COLORS.cyan, 0.035],
		[0.82, 1.0, -0.8, COLORS.white, 0.03],
	];
	dataNodes.forEach(([x, y, z, color, size], index) => {
		const node = addGlowNode(trust, new THREE.Vector3(x, y, z), color, size, index === 1 ? 1 : 0.7);
		trackBreathing(graph, node, 0.03);
	});
	const verification = addCurve(trust, [
		new THREE.Vector3(-1.4, -0.15, -0.44),
		new THREE.Vector3(-0.68, 0.26, 0.22),
		new THREE.Vector3(0.03, 0.02, 0.52),
		new THREE.Vector3(0.84, 0.55, 0.16),
		new THREE.Vector3(1.38, 0.18, 0.76),
	], COLORS.green, 0.34);
	addPulse(graph, trust, verification.curve, COLORS.green, 0.013, 0.04, 0.2);

	graph.userData.update = (elapsed) => {
		outer.rotation.y = -0.12 + Math.sin(elapsed * 0.026) * 0.012;
		inner.rotation.y = 0.18 + Math.sin(elapsed * 0.032) * 0.018;
		plane.rotation.z = 0.05 + Math.sin(elapsed * 0.04) * 0.02;
		core.rotation.y = elapsed * 0.035;
		rings[0].rotation.z = 0.1 + elapsed * 0.012;
		rings[1].rotation.x = 1.1 + Math.sin(elapsed * 0.022) * 0.03;
		rings[2].rotation.y = 0.72 - elapsed * 0.016;
	};
}

function buildLab(graph, small) {
	const launchpad = new THREE.Group();
	launchpad.scale.setScalar(small ? 0.94 : 1.3);
	launchpad.position.set(0, 0.08, 0.12);
	graph.add(launchpad);
	const layers = new THREE.Group();
	launchpad.add(layers);
	layers.userData.items = [];
	const layerDefinitions = [
		{ size: 0.86, y: 0.96, z: 0.34, color: COLORS.green, rotation: [0.06, -0.12, 0.02] },
		{ size: 1.1, y: 0.06, z: 0.02, color: COLORS.cyan, rotation: [-0.1, 0.22, -0.03] },
		{ size: 1.42, y: -0.86, z: -0.24, color: COLORS.violet, rotation: [0.05, -0.18, 0.04] },
	];
	layerDefinitions.forEach((definition, index) => {
		const layer = addBoxBoundary(
			layers,
			[definition.size, definition.size * 0.88, definition.size],
			[0, definition.y, definition.z],
			definition.color,
			0.045,
			definition.rotation
		);
		layer.userData.baseY = definition.y;
		layer.userData.index = index;
		layer.userData.color = definition.color;
		layers.userData.items.push(layer);
		const node = addGlowNode(layer, new THREE.Vector3(
			index === 0 ? 0.2 : -0.18,
			index === 0 ? -0.04 : 0.08,
			index === 2 ? 0.42 : 0.28
		), definition.color, index === 1 ? 0.09 : 0.075, 0.9);
		trackBreathing(graph, node, 0.045);
	});
	layers.userData.gap = 1;
	layers.userData.targetGap = 1;

	const platform = new THREE.Mesh(
		new THREE.CylinderGeometry(1.68, 1.82, 0.08, 64, 1, true),
		basicMaterial(COLORS.cyan, 0.07, { additive: true, side: THREE.DoubleSide })
	);
	platform.position.set(0, -1.52, -0.05);
	launchpad.add(platform);
	const platformEdges = new THREE.LineSegments(
		new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.68, 1.82, 0.08, 32, 1, true)),
		lineMaterial(COLORS.cyan, 0.42, true)
	);
	platformEdges.position.copy(platform.position);
	launchpad.add(platformEdges);
	const rings = [
		addVerificationRing(launchpad, 1.34, COLORS.cyan, [0, -1.48, 0], [Math.PI / 2, 0, 0], 0.7),
		addVerificationRing(launchpad, 1.03, COLORS.green, [0, -1.4, 0.04], [Math.PI / 2, 0.14, 0], 0.55),
		addVerificationRing(launchpad, 0.7, COLORS.violet, [0, -1.32, 0.08], [Math.PI / 2, -0.18, 0], 0.48),
	];
	const satellites = [
		[new THREE.Vector3(-1.65, -0.2, 0.86), COLORS.green, 0.08],
		[new THREE.Vector3(1.5, 0.58, -0.56), COLORS.violet, 0.1],
		[new THREE.Vector3(1.3, -0.76, 0.66), COLORS.cyan, 0.07],
		[new THREE.Vector3(-1.2, 1.2, -0.78), COLORS.cyan, 0.055],
	];
	satellites.forEach(([position, color, size], index) => {
		const node = addGlowNode(launchpad, position, color, size, index === 1 ? 1.15 : 0.82);
		trackBreathing(graph, node, 0.045);
	});
	const connections = [
		[[-1.65, -0.2, 0.86], [-0.75, 0.2, 0.42], [0, 0.96, 0.34]],
		[[1.5, 0.58, -0.56], [0.64, 0.3, -0.1], [0, 0.06, 0.02]],
		[[1.3, -0.76, 0.66], [0.62, -0.86, 0.38], [0, -1.52, -0.05]],
	];
	connections.forEach((points, index) => {
		const route = addCurve(launchpad, points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), [COLORS.green, COLORS.violet, COLORS.cyan][index], 0.48);
		addPulse(graph, launchpad, route.curve, [COLORS.green, COLORS.violet, COLORS.cyan][index], 0.014, 0.042, index * 0.28);
	});

	graph.userData.update = (elapsed, pointer, hovered) => {
		layers.userData.targetGap = hovered ? 1.13 : 1;
		layers.userData.gap += (layers.userData.targetGap - layers.userData.gap) * 0.045;
		layers.userData.items.forEach((layer) => {
			layer.position.y = layer.userData.baseY * layers.userData.gap;
			layer.rotation.y += Math.sin(elapsed * 0.025 + layer.userData.index) * 0.00015;
		});
		launchpad.rotation.y = Math.sin(elapsed * 0.035) * 0.045 + pointer.x * 0.018;
		launchpad.rotation.x = Math.sin(elapsed * 0.028) * 0.022 + pointer.y * 0.012;
		rings[0].rotation.z = elapsed * 0.008;
		rings[1].rotation.z = 0.14 - elapsed * 0.011;
		rings[2].rotation.z = -0.18 + elapsed * 0.015;
	};
}

function createSceneGraph(kind, scene, small) {
	const graph = new THREE.Group();
	graph.userData.breathing = [];
	graph.userData.pulses = [];
	graph.userData.update = () => {};
	scene.add(graph);
	addBackdrop(scene, small);
	switch (kind) {
		case 'career':
			buildCareer(graph, small);
			break;
		case 'projects':
			buildProjects(graph, small);
			break;
		case 'vault':
			buildVault(graph, small);
			break;
		case 'lab':
			buildLab(graph, small);
			break;
		default:
			buildHub(graph, small);
	}
	return graph;
}

function updateEffects(graph, elapsed, pointer, hovered) {
	graph.userData.breathing.forEach(({ node, amount, phase }) => {
		const pulse = 1 + Math.sin(elapsed * 0.55 + phase) * amount;
		node.scale.setScalar(pulse);
	});
	graph.userData.pulses.forEach(({ mesh, curve, speed, phase }) => {
		const t = (phase + elapsed * speed) % 1;
		mesh.position.copy(curve.getPointAt(t < 0 ? t + 1 : t));
		mesh.visible = true;
	});
	graph.userData.update(elapsed, pointer, hovered);
}

function disposeScene(scene) {
	scene.traverse((object) => {
		if (object.geometry) object.geometry.dispose();
		if (object.material) {
			if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
			else object.material.dispose();
		}
	});
}

function mountScene(canvas, kind) {
	const frame = canvas.closest('[data-scene-frame]') || canvas.parentElement;
	const small = isSmallViewport();
	const scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(0x020a12, small ? 0.055 : 0.04);
	const camera = new THREE.PerspectiveCamera(kind === 'career' ? 42 : 38, 1, 0.1, 100);
	camera.position.set(0, 0.06, kind === 'lab' ? 8.8 : kind === 'vault' ? 8.4 : 7.8);
	camera.lookAt(0, 0, 0);
	const renderer = new THREE.WebGLRenderer({
		canvas,
		alpha: true,
		antialias: !small,
		powerPreference: 'high-performance',
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
	renderer.setClearColor(0x000000, 0);
	if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

	const graph = createSceneGraph(kind, scene, small);
	const pointer = new THREE.Vector2();
	const targetPointer = new THREE.Vector2();
	let hovered = false;
	let hidden = document.hidden;
	let frameId = 0;
	let lastTime = performance.now();
	const clockStart = lastTime;

	const resize = () => {
		const width = Math.max(canvas.clientWidth || frame?.clientWidth || 1, 1);
		const height = Math.max(canvas.clientHeight || frame?.clientHeight || 1, 1);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height, false);
	};
	const onPointerMove = (event) => {
		const rect = canvas.getBoundingClientRect();
		targetPointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
		targetPointer.y = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
	};
	const onPointerEnter = () => { hovered = true; };
	const onPointerLeave = () => { hovered = false; targetPointer.set(0, 0); };
	const onVisibility = () => { hidden = document.hidden; };
	const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
	observer?.observe(frame || canvas);
	canvas.addEventListener('pointermove', onPointerMove, { passive: true });
	canvas.addEventListener('pointerenter', onPointerEnter, { passive: true });
	canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
	frame?.addEventListener('pointerenter', onPointerEnter, { passive: true });
	frame?.addEventListener('pointerleave', onPointerLeave, { passive: true });
	document.addEventListener('visibilitychange', onVisibility);
	resize();

	const render = (now) => {
		frameId = requestAnimationFrame(render);
		const delta = Math.min((now - lastTime) / 1000, 0.05);
		lastTime = now;
		if (hidden) return;
		const elapsed = reducedMotion.matches ? 0 : (now - clockStart) / 1000;
		targetPointer.multiplyScalar(0.96);
		pointer.lerp(targetPointer, reducedMotion.matches ? 0.12 : 0.035);
		camera.position.x += (pointer.x * 0.18 - camera.position.x) * 0.035;
		camera.position.y += (0.06 + pointer.y * 0.13 - camera.position.y) * 0.035;
		camera.lookAt(0, 0, 0);
		updateEffects(graph, elapsed + delta * 0.01, pointer, hovered);
		renderer.render(scene, camera);
	};
	canvas.dataset.sceneMounted = 'true';
	canvas.closest('[data-scene-frame]')?.classList.add('scene-ready');
	frameId = requestAnimationFrame(render);

	const cleanup = () => {
		cancelAnimationFrame(frameId);
		observer?.disconnect();
		canvas.removeEventListener('pointermove', onPointerMove);
		canvas.removeEventListener('pointerenter', onPointerEnter);
		canvas.removeEventListener('pointerleave', onPointerLeave);
		frame?.removeEventListener('pointerenter', onPointerEnter);
		frame?.removeEventListener('pointerleave', onPointerLeave);
		document.removeEventListener('visibilitychange', onVisibility);
		disposeScene(scene);
		renderer.dispose();
	};
	window.addEventListener('beforeunload', cleanup, { once: true });
}

function initScenes() {
	setLiveTimes();
	window.setInterval(setLiveTimes, 30000);
	document.querySelectorAll('[data-three-scene]').forEach((canvas) => {
		if (canvas.dataset.sceneMounted) return;
		mountScene(canvas, canvas.dataset.threeScene || 'hub');
	});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initScenes, { once: true });
else initScenes();
