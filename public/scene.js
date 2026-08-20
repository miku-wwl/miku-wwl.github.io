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

function addCore(group, color, size = 0.72) {
	const halo = new THREE.Mesh(
		new THREE.SphereGeometry(size * 1.38, 20, 16),
		setTransparent(new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false }), 0.075),
	);
	const shell = new THREE.Mesh(
		new THREE.SphereGeometry(size, 24, 16),
		setTransparent(new THREE.MeshBasicMaterial({ color, wireframe: true }), 0.72),
	);
	const core = new THREE.Mesh(
		new THREE.SphereGeometry(size * 0.72, 18, 14),
		setTransparent(new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false }), 0.2),
	);
	group.add(halo, shell, core);
}

function addOrbitalSystem(group, { rings = 3, nodes = 8, scale = 1, primary = COLORS.green } = {}) {
	const system = new THREE.Group();
	const core = new THREE.Group();
	addCore(core, primary, 0.72 * scale);
	system.add(core);
	for (let i = 0; i < rings; i += 1) {
		const radius = (1.45 + i * 0.45) * scale;
		const orbit = new THREE.Group();
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(radius, 0.012 * scale, 6, 120),
			setTransparent(new THREE.MeshBasicMaterial({ color: i % 2 ? COLORS.cyan : primary }), 0.76),
		);
		ring.rotation.x = Math.PI / 2;
		ring.rotation.z = (i - 1) * 0.22;
		orbit.add(ring);
		const nodeCount = Math.max(2, Math.round(nodes / (i + 1)));
		for (let n = 0; n < nodeCount; n += 1) {
			const angle = (n / nodeCount) * Math.PI * 2 + i * 0.7;
			const node = new THREE.Mesh(
				new THREE.SphereGeometry(0.045 * scale, 8, 8),
				new THREE.MeshBasicMaterial({ color: i % 2 ? COLORS.violet : COLORS.white }),
			);
			node.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
			orbit.add(node);
		}
		orbit.rotation.x = (i - 1) * 0.18;
		orbit.rotation.z = (i - 1) * 0.13;
		orbit.userData.spin = 0.00016 + i * 0.00006;
		system.add(orbit);
	}
	group.add(system);
	return system;
}

function addNetwork(group, { color = COLORS.cyan, count = 8, radius = 2.6 } = {}) {
	const points = [];
	for (let i = 0; i < count; i += 1) {
		const angle = (i / count) * Math.PI * 2;
		const point = new THREE.Vector3(Math.cos(angle) * radius, (i % 2 ? 0.35 : -0.2) + Math.sin(angle * 2) * 0.22, Math.sin(angle) * radius);
		points.push(point);
		const node = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshBasicMaterial({ color }));
		node.position.copy(point);
		group.add(node);
		addLine(group, [new THREE.Vector3(0, 0, 0), point], color, 0.2);
	}
	for (let i = 0; i < points.length; i += 1) addLine(group, [points[i], points[(i + 1) % points.length]], color, 0.4);
}

function addWireCube(group, size, color, opacity = 0.75) {
	const cube = new THREE.LineSegments(
		new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
		setTransparent(new THREE.LineBasicMaterial({ color }), opacity),
	);
	group.add(cube);
	return cube;
}

function createSceneGraph(kind, scene, small) {
	const visual = new THREE.Group();
	visual.position.y = 0.1;
	scene.add(addGrid(scene, kind === 'projects' ? COLORS.violet : COLORS.muted));
	scene.add(addStars(scene, small ? 55 : 125));

	if (kind === 'projects') {
		const topology = new THREE.Group();
		addWireCube(topology, 3.1, COLORS.cyan, 0.45);
		const middle = addWireCube(topology, 2.0, COLORS.violet, 0.68);
		middle.rotation.y = Math.PI / 4;
		const inner = addWireCube(topology, 0.9, COLORS.green, 0.95);
		inner.rotation.x = Math.PI / 4;
		addNetwork(topology, { color: COLORS.cyan, count: small ? 5 : 8, radius: 2.25 });
		topology.userData.spin = 0.00022;
		visual.add(topology);
	} else if (kind === 'vault') {
		const vault = new THREE.Group();
		addWireCube(vault, 2.9, COLORS.cyan, 0.5);
		const inner = addWireCube(vault, 1.95, COLORS.green, 0.72);
		inner.rotation.y = Math.PI / 4;
		const dial = new THREE.Mesh(
			new THREE.TorusGeometry(0.72, 0.055, 8, 64),
			setTransparent(new THREE.MeshBasicMaterial({ color: COLORS.green }), 0.9),
		);
		dial.rotation.x = Math.PI / 2;
		vault.add(dial);
		addCore(vault, COLORS.green, 0.44);
		const rings = new THREE.Group();
		[2.0, 2.35, 2.7].forEach((radius, index) => {
			const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.01, 5, 100), setTransparent(new THREE.MeshBasicMaterial({ color: index % 2 ? COLORS.violet : COLORS.cyan }), 0.45));
			ring.rotation.x = Math.PI / 2;
			rings.add(ring);
		});
		vault.add(rings);
		vault.userData.spin = 0.00018;
		visual.add(vault);
	} else if (kind === 'lab') {
		const lab = new THREE.Group();
		const platform = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.35, 0.18, 64), setTransparent(new THREE.MeshBasicMaterial({ color: COLORS.cyan, wireframe: true }), 0.62));
		platform.position.y = -0.9;
		lab.add(platform);
		[1.25, 1.65, 2.1].forEach((radius, index) => {
			const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 96), setTransparent(new THREE.MeshBasicMaterial({ color: index === 1 ? COLORS.violet : COLORS.green }), 0.78));
			ring.rotation.x = Math.PI / 2;
			ring.position.y = -0.78;
			lab.add(ring);
		});
		const centerCube = addWireCube(lab, 1.7, COLORS.cyan, 0.86);
		const innerCube = addWireCube(lab, 0.78, COLORS.green, 0.95);
		innerCube.rotation.y = Math.PI / 4;
		addCore(lab, COLORS.cyan, 0.32);
		const modules = small ? 4 : 7;
		for (let i = 0; i < modules; i += 1) {
			const angle = (i / modules) * Math.PI * 2;
			const point = new THREE.Vector3(Math.cos(angle) * 3, Math.sin(i * 1.7) * 0.4, Math.sin(angle) * 2.1);
			const node = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), new THREE.MeshBasicMaterial({ color: i % 2 ? COLORS.violet : COLORS.green }));
			node.position.copy(point);
			lab.add(node);
			addLine(lab, [new THREE.Vector3(0, -0.35, 0), point], i % 2 ? COLORS.violet : COLORS.cyan, 0.32);
		}
		centerCube.userData.spin = 0.00028;
		lab.userData.spin = 0.0002;
		visual.add(lab);
	} else {
		const orbital = addOrbitalSystem(visual, { rings: kind === 'career' ? 2 : 3, nodes: small ? 5 : 9, scale: kind === 'career' ? 0.92 : 1, primary: COLORS.green });
		if (kind === 'career') addNetwork(visual, { color: COLORS.cyan, count: small ? 5 : 7, radius: 2.7 });
		orbital.userData.spin = 0.0002;
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
