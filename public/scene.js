import * as THREE from './vendor/three.module.js';

const COLORS = {
	green: 0x29f2a0,
	cyan: 0x24c8ff,
	violet: 0xb06cff,
	amber: 0xf2b84b,
	white: 0xe8f6ff,
	muted: 0x41657b,
};

const isSmallViewport = () => window.matchMedia('(max-width: 720px)').matches;

function setLiveTimes() {
	const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	document.querySelectorAll('[data-live-time]').forEach((node) => { node.textContent = time; });
}

function setTransparent(material, opacity) {
	material.transparent = true;
	material.opacity = opacity;
	return material;
}

function addStars(scene, count) {
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const palette = [new THREE.Color(COLORS.cyan), new THREE.Color(COLORS.green), new THREE.Color(COLORS.violet)];
	for (let i = 0; i < count; i += 1) {
		positions[i * 3] = (Math.random() - 0.5) * 18;
		positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
		positions[i * 3 + 2] = (Math.random() - 0.5) * 12 - 2;
		const color = palette[i % palette.length];
		colors[i * 3] = color.r;
		colors[i * 3 + 1] = color.g;
		colors[i * 3 + 2] = color.b;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	const material = new THREE.PointsMaterial({ size: 0.028, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true });
	return new THREE.Points(geometry, material);
}

function addGrid(scene, color = COLORS.muted) {
	const grid = new THREE.GridHelper(20, 30, color, color);
	const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
	materials.forEach((material) => setTransparent(material, 0.17));
	grid.position.y = -2.25;
	return grid;
}

function addLine(group, points, color, opacity = 0.5) {
	const geometry = new THREE.BufferGeometry().setFromPoints(points);
	const material = setTransparent(new THREE.LineBasicMaterial({ color }), opacity);
	group.add(new THREE.Line(geometry, material));
}

function addGlowCore(group, color, size = 0.72) {
	const halo = new THREE.Mesh(
		new THREE.SphereGeometry(size * 1.5, 20, 14),
		setTransparent(new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false }), 0.085),
	);
	const shell = new THREE.Mesh(
		new THREE.SphereGeometry(size, 28, 20),
		setTransparent(new THREE.MeshBasicMaterial({ color, wireframe: true }), 0.78),
	);
	const inner = new THREE.Mesh(
		new THREE.SphereGeometry(size * 0.72, 20, 14),
		setTransparent(new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false }), 0.24),
	);
	group.add(halo, shell, inner);
	return shell;
}

function addSurfacePoints(group, radius, color, count = 120) {
	const positions = new Float32Array(count * 3);
	for (let i = 0; i < count; i += 1) {
		const y = 1 - (i / (count - 1)) * 2;
		const ring = Math.sqrt(Math.max(0, 1 - y * y));
		const angle = i * 2.399963;
		positions[i * 3] = Math.cos(angle) * ring * radius;
		positions[i * 3 + 1] = y * radius;
		positions[i * 3 + 2] = Math.sin(angle) * ring * radius;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	group.add(new THREE.Points(geometry, setTransparent(new THREE.PointsMaterial({ color, size: 0.028, sizeAttenuation: true }), 0.78)));
}

function addWMark(group, color, scale = 1) {
	const shape = new THREE.Shape();
	shape.moveTo(-0.52, 0.36);
	shape.lineTo(-0.38, 0.36);
	shape.lineTo(-0.25, -0.12);
	shape.lineTo(0, 0.22);
	shape.lineTo(0.25, -0.12);
	shape.lineTo(0.38, 0.36);
	shape.lineTo(0.52, 0.36);
	shape.lineTo(0.25, -0.36);
	shape.lineTo(0, -0.06);
	shape.lineTo(-0.25, -0.36);
	shape.closePath();
	const mark = new THREE.Mesh(new THREE.ShapeGeometry(shape), setTransparent(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), 0.96));
	mark.position.z = 0.72 * scale;
	mark.scale.setScalar(scale);
	mark.renderOrder = 3;
	group.add(mark);
	const points = [
		new THREE.Vector3(-0.48, 0.34, 0.67),
		new THREE.Vector3(-0.25, -0.28, 0.67),
		new THREE.Vector3(0, 0.12, 0.67),
		new THREE.Vector3(0.25, -0.28, 0.67),
		new THREE.Vector3(0.48, 0.34, 0.67),
	].map((point) => point.multiplyScalar(scale));
	addLine(group, points, color, 0.96);
}

function addOrbitRing(group, radius, color, opacity, tilt = 0, squash = 0.72) {
	const orbit = new THREE.Group();
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(radius, 0.014, 7, 128),
		setTransparent(new THREE.MeshBasicMaterial({ color }), opacity),
	);
	ring.scale.z = squash;
	ring.rotation.x = Math.PI / 2 + tilt;
	orbit.add(ring);
	group.add(orbit);
	return orbit;
}

function addOrbitalSystem(group, { rings = 4, nodes = 14, scale = 1, primary = COLORS.green, withMark = true } = {}) {
	const system = new THREE.Group();
	const planet = new THREE.Group();
	addGlowCore(planet, primary, 0.68 * scale);
	addSurfacePoints(planet, 0.7 * scale, primary, 100);
	if (withMark) addWMark(planet, COLORS.white, 0.72 * scale);
	system.add(planet);
	for (let i = 0; i < rings; i += 1) {
		const radius = (1.28 + i * 0.48) * scale;
		const orbit = addOrbitRing(system, radius, i % 3 === 1 ? COLORS.cyan : i === 3 ? COLORS.violet : primary, i === 0 ? 0.88 : 0.62, (i - 1.5) * 0.27, 0.72 + (i % 2) * 0.12);
		const nodeCount = Math.max(3, Math.round(nodes / (i === 0 ? 1.4 : 1.9)));
		for (let n = 0; n < nodeCount; n += 1) {
			const angle = (n / nodeCount) * Math.PI * 2 + i * 0.7;
			const node = new THREE.Mesh(
				new THREE.SphereGeometry((i === 0 ? 0.06 : 0.045) * scale, 8, 8),
				new THREE.MeshBasicMaterial({ color: n % 3 === 0 ? COLORS.white : i % 2 ? COLORS.violet : COLORS.cyan }),
			);
			node.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * (0.72 + (i % 2) * 0.12));
			orbit.add(node);
		}
		orbit.rotation.z += i * 0.16;
		orbit.userData.spin = 0.00012 + i * 0.000045;
	}
	group.add(system);
	return system;
}

function addNetwork(group, { color = COLORS.cyan, count = 9, radius = 2.7, spread = 0.55 } = {}) {
	const points = [];
	for (let i = 0; i < count; i += 1) {
		const angle = (i / count) * Math.PI * 2;
		const point = new THREE.Vector3(
			Math.cos(angle) * radius,
			(i % 3 - 1) * spread + Math.sin(angle * 2) * 0.2,
			Math.sin(angle) * radius * 0.62,
		);
		points.push(point);
		const node = new THREE.Mesh(new THREE.SphereGeometry(i % 4 === 0 ? 0.085 : 0.05, 8, 8), new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? color : COLORS.white }));
		node.position.copy(point);
		group.add(node);
		if (i % 2 === 0) addLine(group, [new THREE.Vector3(0, 0, 0), point], color, 0.25);
	}
	for (let i = 0; i < points.length - 1; i += 1) addLine(group, [points[i], points[i + 1]], color, 0.42);
}

function addWireCube(group, size, color, opacity = 0.75, dimensions = null) {
	const geometry = dimensions ? new THREE.BoxGeometry(...dimensions) : new THREE.BoxGeometry(size, size, size);
	const cube = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), setTransparent(new THREE.LineBasicMaterial({ color }), opacity));
	group.add(cube);
	return cube;
}

function addSolidCube(group, dimensions, color, opacity, z = 0) {
	const cube = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), setTransparent(new THREE.MeshBasicMaterial({ color }), opacity));
	cube.position.z = z;
	group.add(cube);
	return cube;
}

function addGroundRings(group, radii, colors = [COLORS.cyan, COLORS.green, COLORS.violet]) {
	radii.forEach((radius, index) => {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, index === 0 ? 0.03 : 0.014, 7, 128), setTransparent(new THREE.MeshBasicMaterial({ color: colors[index % colors.length] }), index === 0 ? 0.8 : 0.48));
		ring.rotation.x = Math.PI / 2;
		group.add(ring);
	});
}

function addVaultModel(group, small) {
	const vault = new THREE.Group();
	const scale = small ? 0.86 : 1;
	vault.scale.setScalar(scale);
	const body = addWireCube(vault, 1, COLORS.cyan, 0.58, [2.8, 2.2, 1.65]);
	body.position.y = 0.12;
	addSolidCube(vault, [2.5, 1.92, 1.25], COLORS.cyan, 0.07, 0.02).position.y = 0.12;
	const inner = addWireCube(vault, 1, COLORS.green, 0.72, [2.2, 1.65, 1.32]);
	inner.position.y = 0.12;
	const door = addSolidCube(vault, [2.15, 1.58, 0.11], COLORS.green, 0.08, 0.88);
	door.position.y = 0.12;
	const doorEdge = addWireCube(vault, 1, COLORS.green, 0.9, [2.15, 1.58, 0.11]);
	doorEdge.position.set(0, 0.12, 0.94);
	const dial = new THREE.Group();
	dial.position.set(0, 0.12, 1.02);
	[0.58, 0.43, 0.27].forEach((radius, index) => {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, index === 0 ? 0.045 : 0.018, 8, 64), setTransparent(new THREE.MeshBasicMaterial({ color: index === 1 ? COLORS.cyan : COLORS.green }), index === 0 ? 0.95 : 0.72));
		dial.add(ring);
	});
	for (let i = 0; i < 8; i += 1) {
		const angle = (i / 8) * Math.PI * 2;
		addLine(dial, [new THREE.Vector3(Math.cos(angle) * 0.32, Math.sin(angle) * 0.32, 0.02), new THREE.Vector3(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.02)], COLORS.cyan, 0.5);
	}
	addLine(dial, [new THREE.Vector3(-0.19, 0.01, 0.04), new THREE.Vector3(-0.05, -0.16, 0.04), new THREE.Vector3(0.24, 0.19, 0.04)], COLORS.white, 0.98);
	vault.add(dial);
	[-1, 1].forEach((x) => [-1, 1].forEach((y) => {
		const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), new THREE.MeshBasicMaterial({ color: COLORS.white }));
		bolt.position.set(x * 1.0, 0.12 + y * 0.7, 1.02);
		vault.add(bolt);
	}));
	for (let i = 0; i < 3; i += 1) {
		const beam = addSolidCube(vault, [0.025, 1.45 + i * 0.16, 0.025], i % 2 ? COLORS.green : COLORS.cyan, 0.24, -0.15 + i * 0.15);
		beam.position.set(-1.06 + i * 1.06, 0.12, -0.42);
	}
	addGroundRings(vault, [1.6, 2.05, 2.5]);
	vault.userData.spin = 0.00012;
	group.add(vault);
}

function addLabModel(group, small) {
	const lab = new THREE.Group();
	const scale = small ? 0.9 : 1;
	lab.scale.setScalar(scale);
	const platform = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.42, 0.18, 64), setTransparent(new THREE.MeshBasicMaterial({ color: COLORS.cyan, wireframe: true }), 0.68));
	platform.position.y = -1.02;
	lab.add(platform);
	addGroundRings(lab, [1.15, 1.58, 2.06, 2.48], [COLORS.green, COLORS.cyan, COLORS.violet]);
	[1.2, 1.55, 1.9].forEach((radius, index) => {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.026, 8, 96), setTransparent(new THREE.MeshBasicMaterial({ color: index === 1 ? COLORS.violet : COLORS.green }), 0.72));
		ring.position.y = -0.92;
		lab.add(ring);
	});
	const outer = addWireCube(lab, 1, COLORS.cyan, 0.82, [1.55, 1.65, 1.45]);
	outer.position.y = -0.05;
	outer.rotation.y = 0.18;
	const middle = addWireCube(lab, 1, COLORS.green, 0.85, [0.95, 1.15, 0.9]);
	middle.position.y = 0.06;
	middle.rotation.y = -0.26;
	const step = addSolidCube(lab, [0.42, 0.55, 0.42], COLORS.cyan, 0.28, 0.18);
	step.position.y = 0.42;
	const beam = addSolidCube(lab, [0.07, 1.8, 0.07], COLORS.green, 0.24, 0);
	beam.position.y = 0.45;
	addLine(lab, [new THREE.Vector3(0, -0.65, 0), new THREE.Vector3(0, 1.32, 0)], COLORS.white, 0.35);
	const modules = small ? 5 : 9;
	for (let i = 0; i < modules; i += 1) {
		const angle = (i / modules) * Math.PI * 2;
		const point = new THREE.Vector3(Math.cos(angle) * (2.35 + (i % 2) * 0.35), -0.25 + Math.sin(i * 1.7) * 0.52, Math.sin(angle) * 1.55);
		const node = new THREE.Mesh(new THREE.SphereGeometry(i % 3 === 0 ? 0.1 : 0.065, 10, 10), new THREE.MeshBasicMaterial({ color: i % 2 ? COLORS.violet : COLORS.green }));
		node.position.copy(point);
		lab.add(node);
		addLine(lab, [new THREE.Vector3(0, -0.25, 0), point], i % 2 ? COLORS.violet : COLORS.cyan, 0.28);
	}
	outer.userData.spin = 0.00016;
	middle.userData.spin = -0.00022;
	lab.userData.spin = 0.00011;
	group.add(lab);
}

function addProjectModel(group, small) {
	const topology = new THREE.Group();
	const scale = small ? 0.86 : 1;
	topology.scale.setScalar(scale);
	const outer = addWireCube(topology, 1, COLORS.cyan, 0.46, [2.8, 2.35, 2.45]);
	outer.position.x = -0.1;
	const middle = addWireCube(topology, 1, COLORS.violet, 0.76, [1.9, 1.7, 1.85]);
	middle.position.set(0.12, 0.04, 0.05);
	middle.rotation.y = 0.18;
	const inner = addWireCube(topology, 1, COLORS.green, 0.98, [0.82, 0.86, 0.78]);
	inner.position.set(0.1, -0.02, 0.1);
	inner.rotation.y = -0.3;
	addSolidCube(topology, [0.5, 0.5, 0.5], COLORS.green, 0.18, 0.1).position.set(0.1, -0.02, 0.22);
	const points = [
		new THREE.Vector3(-1.62, 0.55, 0.55),
		new THREE.Vector3(1.4, 0.9, 0.35),
		new THREE.Vector3(1.62, -0.7, 0.15),
		new THREE.Vector3(-1.45, -0.82, -0.3),
		new THREE.Vector3(0.1, 1.5, -0.65),
	];
	points.forEach((point, index) => {
		const node = new THREE.Mesh(new THREE.SphereGeometry(index === 1 ? 0.09 : 0.06, 8, 8), new THREE.MeshBasicMaterial({ color: index % 2 ? COLORS.cyan : COLORS.white }));
		node.position.copy(point);
		topology.add(node);
		addLine(topology, [new THREE.Vector3(0.1, 0, 0.1), point], index % 2 ? COLORS.cyan : COLORS.violet, 0.34);
	});
	addLine(topology, [points[0], points[1], points[2], points[3], points[0]], COLORS.cyan, 0.46);
	outer.userData.spin = 0.0001;
	middle.userData.spin = -0.00018;
	topology.userData.spin = 0.00013;
	group.add(topology);
}

function createSceneGraph(kind, scene, small) {
	const visual = new THREE.Group();
	visual.position.y = 0.12;
	scene.add(addGrid(scene, kind === 'projects' ? COLORS.violet : COLORS.muted));
	scene.add(addStars(scene, small ? 72 : 165));

	if (kind === 'projects') {
		addProjectModel(visual, small);
	} else if (kind === 'vault') {
		addVaultModel(visual, small);
	} else if (kind === 'lab') {
		addLabModel(visual, small);
	} else {
		const orbital = addOrbitalSystem(visual, { rings: kind === 'career' ? 3 : 4, nodes: small ? 8 : 16, scale: kind === 'career' ? 0.85 : 0.92, primary: COLORS.green, withMark: true });
		if (kind === 'career') addNetwork(visual, { color: COLORS.cyan, count: small ? 7 : 11, radius: 2.7, spread: 0.7 });
		orbital.userData.spin = 0.00018;
	}
	visual.userData.spin = kind === 'lab' ? 0.00012 : 0.00008;
	visual.userData.parts = visual.children;
	scene.add(visual);
	return visual;
}

function mountScene(canvas, kind) {
	const frame = canvas.parentElement;
	const small = isSmallViewport();
	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !small, powerPreference: 'high-performance' });
	} catch (_) {
		frame?.classList.add('scene-fallback-visible');
		return;
	}
	const scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(0x030a12, 0.055);
	const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
	camera.position.set(0, 1.4, kind === 'lab' ? 8.5 : 7.3);
	const ambient = new THREE.AmbientLight(0x6c98b6, 0.9);
	scene.add(ambient);
	const graph = createSceneGraph(kind, scene, small);
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const pointer = { x: 0, y: 0 };
	const onPointer = (event) => {
		pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
		pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
	};
	window.addEventListener('pointermove', onPointer, { passive: true });
	const resize = () => {
		const width = Math.max(1, frame?.clientWidth || canvas.clientWidth || 600);
		const height = Math.max(1, frame?.clientHeight || canvas.clientHeight || 320);
		const pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.15 : 1.65);
		renderer.setPixelRatio(pixelRatio);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.render(scene, camera);
	};
	resize();
	frame?.classList.add('scene-ready');
	const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
	observer?.observe(frame);
	let animationFrame = 0;
	let stopped = false;
	const animate = (time) => {
		if (stopped || document.hidden) return;
		const elapsed = time * 0.001;
		if (!reduceMotion) {
			graph.rotation.y = elapsed * graph.userData.spin;
			graph.position.x += ((pointer.x * 0.22) - graph.position.x) * 0.018;
			graph.position.y = 0.1 + ((-pointer.y * 0.12) - 0.1) * 0.018;
			graph.children.forEach((child) => {
				if (child.userData.spin) child.rotation.y = elapsed * child.userData.spin;
			});
			camera.position.x += (pointer.x * 0.42 - camera.position.x) * 0.008;
			camera.position.y += (1.4 - pointer.y * 0.22 - camera.position.y) * 0.008;
			camera.lookAt(0, 0, 0);
			renderer.render(scene, camera);
		}
		animationFrame = requestAnimationFrame(animate);
	};
	const onVisibility = () => {
		if (document.hidden) cancelAnimationFrame(animationFrame);
		else if (!reduceMotion) animationFrame = requestAnimationFrame(animate);
	};
	document.addEventListener('visibilitychange', onVisibility);
	if (!reduceMotion) animationFrame = requestAnimationFrame(animate);
	else renderer.render(scene, camera);
	window.addEventListener('beforeunload', () => {
		stopped = true;
		cancelAnimationFrame(animationFrame);
		observer?.disconnect();
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('pointermove', onPointer);
		renderer.dispose();
	});
}

function initScenes() {
	document.querySelectorAll('[data-three-scene]').forEach((canvas) => {
		if (canvas.dataset.sceneMounted) return;
		canvas.dataset.sceneMounted = 'true';
		mountScene(canvas, canvas.dataset.threeScene || 'hub');
	});
	setLiveTimes();
	window.setInterval(setLiveTimes, 30000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initScenes, { once: true });
else initScenes();
