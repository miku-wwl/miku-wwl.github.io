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
let glowTexture;

function getGlowTexture() {
	if (glowTexture) return glowTexture;
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	const context = canvas.getContext('2d');
	const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
	gradient.addColorStop(0, 'rgba(255,255,255,1)');
	gradient.addColorStop(0.12, 'rgba(255,255,255,0.96)');
	gradient.addColorStop(0.3, 'rgba(255,255,255,0.38)');
	gradient.addColorStop(0.62, 'rgba(255,255,255,0.08)');
	gradient.addColorStop(1, 'rgba(255,255,255,0)');
	context.fillStyle = gradient;
	context.fillRect(0, 0, 128, 128);
	glowTexture = new THREE.CanvasTexture(canvas);
	return glowTexture;
}

function seededRandom(seed) {
	let value = seed >>> 0;
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0;
		return value / 4294967296;
	};
}

function seededNormal(random) {
	const u = Math.max(random(), 0.000001);
	const v = random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function registerMaterial(graph, material) {
	graph.userData.dynamicMaterials.push(material);
	return material;
}

function basicMaterial(color, opacity = 1, additive = true, side = THREE.FrontSide) {
	return new THREE.MeshBasicMaterial({
		color,
		transparent: opacity < 1,
		opacity,
		depthWrite: false,
		blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
		side,
	});
}

function surfaceMaterial(graph, color, opacity = 0.6, pattern = 1, blending = THREE.AdditiveBlending) {
	return registerMaterial(graph, new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(color) },
			uOpacity: { value: opacity },
			uTime: { value: 0 },
			uPattern: { value: pattern },
		},
		vertexShader: [
			'varying vec3 vNormal;',
			'varying vec3 vWorldPosition;',
			'varying vec2 vUv;',
			'void main() {',
			'  vNormal = normalize(mat3(modelMatrix) * normal);',
			'  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
			'  vWorldPosition = worldPosition.xyz;',
			'  vUv = uv;',
			'  gl_Position = projectionMatrix * viewMatrix * worldPosition;',
			'}',
		].join('\n'),
		fragmentShader: [
			'uniform vec3 uColor;',
			'uniform float uOpacity;',
			'uniform float uTime;',
			'uniform float uPattern;',
			'varying vec3 vNormal;',
			'varying vec3 vWorldPosition;',
			'varying vec2 vUv;',
			'float hash21(vec2 p) {',
			'  p = fract(p * vec2(123.34, 456.21));',
			'  p += dot(p, p + 45.32);',
			'  return fract(p.x * p.y);',
			'}',
			'void main() {',
			'  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);',
			'  float facing = abs(dot(normalize(vNormal), viewDirection));',
			'  float rim = pow(1.0 - facing, 2.1);',
			'  float latitude = 1.0 - smoothstep(0.02, 0.08, abs(sin((vUv.y + uTime * 0.006) * 26.0)));',
			'  float longitude = 1.0 - smoothstep(0.03, 0.12, abs(sin((vUv.x - uTime * 0.004) * 18.0)));',
			'  float flecks = step(0.987, hash21(floor(vUv * vec2(46.0, 28.0))));',
			'  float pattern = uPattern < 0.5 ? flecks * 0.82 : longitude * 0.055 + latitude * 0.06 + flecks * 0.82;',
			'  vec3 color = uColor * (0.18 + rim * 1.65 + pattern);',
			'  float alpha = uOpacity * (0.1 + rim * 0.9 + pattern * 0.1);',
			'  gl_FragColor = vec4(color, alpha);',
			'}',
		].join('\n'),
		transparent: true,
		depthWrite: false,
		blending,
		side: THREE.DoubleSide,
	}));
}

function particleMaterial(graph, opacity = 0.7) {
	return registerMaterial(graph, new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity } },
		vertexShader: [
			'uniform float uTime;',
			'attribute vec3 aColor;',
			'attribute float aSize;',
			'attribute float aTwinkle;',
			'varying vec3 vColor;',
			'varying float vTwinkle;',
			'void main() {',
			'  vColor = aColor;',
			'  vTwinkle = aTwinkle;',
			'  vec3 p = position;',
			'  p.y += sin(uTime * 0.18 + aTwinkle * 6.283) * 0.008;',
			'  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);',
			'  gl_Position = projectionMatrix * viewPosition;',
			'  gl_PointSize = min(10.0, max(1.0, aSize * 42.0 / max(1.0, -viewPosition.z)));',
			'}',
		].join('\n'),
		fragmentShader: [
			'uniform float uOpacity;',
			'varying vec3 vColor;',
			'varying float vTwinkle;',
			'void main() {',
			'  float distanceFromCenter = distance(gl_PointCoord, vec2(0.5));',
			'  if (distanceFromCenter > 0.5) discard;',
			'  float softness = pow(1.0 - distanceFromCenter * 2.0, 1.65);',
			'  float twinkle = 0.78 + 0.22 * sin(vTwinkle * 20.0);',
			'  gl_FragColor = vec4(vColor * (0.55 + softness * 0.9), softness * uOpacity * twinkle);',
			'}',
		].join('\n'),
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}));
}

function addParticleSet(graph, parent, positions, colors, sizes, twinkles, opacity = 0.7) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
	geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(colors), 3));
	geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(sizes), 1));
	geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(new Float32Array(twinkles), 1));
	const points = new THREE.Points(geometry, particleMaterial(graph, opacity));
	parent.add(points);
	return points;
}

function addStarField(graph, scene, small, seed = 19, mode = 'deep') {
	const random = seededRandom(seed);
	const count = small ? 420 : mode === 'galaxy' ? 2500 : 1600;
	const positions = [];
	const colors = [];
	const sizes = [];
	const twinkles = [];
	const haloPositions = [];
	const haloColors = [];
	const haloSizes = [];
	const haloTwinkles = [];
	const palette = [
		new THREE.Color(COLORS.cyan),
		new THREE.Color(COLORS.green),
		new THREE.Color(COLORS.violet),
		new THREE.Color(COLORS.white),
	];
	for (let index = 0; index < count; index += 1) {
		let x;
		let y;
		let z;
		const normalX = seededNormal(random);
		const normalY = seededNormal(random);
		const normalZ = seededNormal(random);

		if (mode === 'galaxy' && random() < 0.78) {
			// Four noisy spiral arms: dense near the core, stretched into a
			// shallow disk so the field reads as a galaxy behind the scene.
			const armIndex = Math.floor(random() * 4);
			const radius = 0.42 + Math.pow(random(), 0.58) * 8.4;
			const angle = radius * 0.92 + armIndex * (Math.PI * 0.5) + normalX * 0.2;
			const armWidth = 0.12 + radius * 0.045;
			x = Math.cos(angle) * radius * 1.5 + normalY * armWidth;
			y = Math.sin(angle * 1.7) * 0.12 + normalZ * (0.18 + radius * 0.07);
			z = -4.9 + Math.sin(angle) * radius * 0.22 + normalX * 0.62;
		} else {
			// Deep-field layers use a soft volume instead of a flat uniform grid.
			const depth = random();
			x = normalX * (3.2 + depth * 4.6);
			y = normalY * (1.15 + depth * 2.4);
			z = -3.2 - depth * 7.5 + normalZ * 0.45;
		}

		positions.push(x, y, z);
		const colorRoll = random();
		const color = colorRoll < 0.46
			? palette[0]
			: colorRoll < 0.72
				? palette[1]
				: colorRoll < 0.9
					? palette[2]
					: palette[3];
		const intensity = 0.76 + Math.pow(random(), 2.8) * 0.76;
		colors.push(color.r * intensity, color.g * intensity, color.b * intensity);
		const size = 0.1 + Math.pow(random(), 4.8) * (mode === 'galaxy' ? 3.25 : 2.5);
		const twinkle = random();
		sizes.push(size);
		twinkles.push(twinkle);
		if (!small && size > 0.72) {
			haloPositions.push(x, y, z);
			haloColors.push(color.r * intensity, color.g * intensity, color.b * intensity);
			haloSizes.push(size * 2.25);
			haloTwinkles.push(twinkle);
		}
	}
	const points = addParticleSet(graph, scene, positions, colors, sizes, twinkles, mode === 'galaxy' ? 0.86 : 0.72);
	if (haloPositions.length > 0) {
		addParticleSet(graph, scene, haloPositions, haloColors, haloSizes, haloTwinkles, mode === 'galaxy' ? 0.13 : 0.1);
	}
	return points;
}

function addSphericalParticles(graph, parent, radius, count, seed, opacity = 0.8) {
	const random = seededRandom(seed);
	const positions = [];
	const colors = [];
	const sizes = [];
	const twinkles = [];
	const palette = [new THREE.Color(COLORS.green), new THREE.Color(COLORS.cyan), new THREE.Color(COLORS.white)];
	for (let index = 0; index < count; index += 1) {
		const theta = random() * Math.PI * 2;
		const phi = Math.acos(1 - 2 * random());
		const r = radius * (0.92 + random() * 0.08);
		positions.push(
			r * Math.sin(phi) * Math.cos(theta),
			r * Math.cos(phi),
			r * Math.sin(phi) * Math.sin(theta),
		);
		const color = palette[index % palette.length];
		colors.push(color.r, color.g, color.b);
		sizes.push(0.22 + random() * 0.7);
		twinkles.push(random());
	}
	return addParticleSet(graph, parent, positions, colors, sizes, twinkles, opacity);
}

function addGridFloor(graph, scene, color = COLORS.cyan, y = -1.45, z = -0.4, opacity = 0.26) {
	const material = registerMaterial(graph, new THREE.ShaderMaterial({
		uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
		vertexShader: [
			'varying vec2 vUv;',
			'void main() {',
			'  vUv = uv;',
			'  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
			'}',
		].join('\n'),
		fragmentShader: [
			'uniform vec3 uColor;',
			'uniform float uOpacity;',
			'varying vec2 vUv;',
			'void main() {',
			'  vec2 cell = abs(fract(vUv * vec2(28.0, 18.0)) - 0.5);',
			'  float line = 1.0 - smoothstep(0.465, 0.5, max(cell.x, cell.y));',
			'  float fade = 1.0 - smoothstep(0.12, 0.78, length(vUv - vec2(0.5, 0.37)));',
			'  gl_FragColor = vec4(uColor, line * fade * uOpacity);',
			'}',
		].join('\n'),
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
	}));
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), material);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(0, y, z);
	scene.add(floor);
	return floor;
}

function addBackdrop(graph, scene, small, mode = 'deep') {
	addStarField(graph, scene, small, mode === 'galaxy' ? 71 : 19, mode);
	if (!small && mode === 'galaxy') addStarField(graph, scene, false, 113, 'deep');
	if (!small && mode !== 'galaxy') addStarField(graph, scene, false, 113, 'deep');
	const nebulaMaterial = registerMaterial(graph, new THREE.ShaderMaterial({
		uniforms: {
			uPrimary: { value: new THREE.Color(mode === 'galaxy' ? COLORS.cyan : COLORS.violet) },
			uSecondary: { value: new THREE.Color(mode === 'galaxy' ? COLORS.green : COLORS.cyan) },
			uOpacity: { value: mode === 'galaxy' ? 0.12 : 0.08 },
			uTime: { value: 0 },
		},
		vertexShader: [
			'varying vec2 vUv;',
			'void main() {',
			'  vUv = uv;',
			'  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
			'}',
		].join('\n'),
		fragmentShader: [
			'uniform vec3 uPrimary;',
			'uniform vec3 uSecondary;',
			'uniform float uOpacity;',
			'uniform float uTime;',
			'varying vec2 vUv;',
			'void main() {',
			'  vec2 p = vUv - 0.5;',
			'  float core = exp(-dot(p * vec2(1.0, 1.8), p * vec2(1.0, 1.8)) * 4.0);',
			'  float wave = 0.5 + 0.5 * sin(p.x * 18.0 + p.y * 9.0 + uTime * 0.015);',
			'  float cloud = core * (0.58 + wave * 0.42);',
			'  vec3 color = mix(uPrimary, uSecondary, smoothstep(-0.42, 0.42, p.x + p.y));',
			'  gl_FragColor = vec4(color, cloud * uOpacity);',
			'}',
		].join('\n'),
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}));
	const haze = new THREE.Mesh(
		new THREE.PlaneGeometry(14, 5),
		nebulaMaterial,
	);
	haze.position.set(0, 0.25, -4.8);
	scene.add(haze);
}

function addGlowNode(graph, parent, position, color, size = 0.11, emphasis = 1, label = '') {
	const node = new THREE.Group();
	node.position.copy(position);
	node.userData.phase = position.x * 0.7 + position.y * 0.45 + position.z * 0.21;
	node.userData.emphasis = emphasis;
	node.userData.label = label;

	const outerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
		map: getGlowTexture(),
		color,
		transparent: true,
		opacity: 0.1 + emphasis * 0.035,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}));
	outerGlow.scale.setScalar(size * (4.6 + emphasis * 0.45));
	const innerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
		map: getGlowTexture(),
		color,
		transparent: true,
		opacity: 0.22 + emphasis * 0.04,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}));
	innerGlow.scale.setScalar(size * (2.1 + emphasis * 0.25));
	const shell = new THREE.Mesh(
		new THREE.SphereGeometry(size * 1.12, 28, 20),
		surfaceMaterial(graph, color, 0.4 + emphasis * 0.05, 1),
	);
	const core = new THREE.Mesh(
		new THREE.SphereGeometry(size * (0.5 + emphasis * 0.07), 20, 14),
		surfaceMaterial(graph, color, 0.78, 2),
	);
	const pointCore = new THREE.Mesh(
		new THREE.SphereGeometry(size * (0.38 + emphasis * 0.035), 18, 12),
		basicMaterial(color, 0.88, true),
	);
	node.add(outerGlow, innerGlow, shell, core, pointCore);
	if (emphasis > 1.15) {
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(size * 1.32, Math.max(size * 0.035, 0.008), 8, 48),
			basicMaterial(color, 0.34, true),
		);
		ring.rotation.set(0.8, 0.2, 0.4);
		node.add(ring);
		node.userData.ring = ring;
	}
	parent.add(node);
	return node;
}

function addTubePath(graph, parent, points, color, radius = 0.012, opacity = 0.5, closed = false) {
	const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal', 0.35);
	const group = new THREE.Group();
	const glow = new THREE.Mesh(
		new THREE.TubeGeometry(curve, closed ? 96 : 54, radius * 3.2, 6, closed),
		basicMaterial(color, opacity * 0.08, true),
	);
	const tube = new THREE.Mesh(
		new THREE.TubeGeometry(curve, closed ? 96 : 54, radius, 6, closed),
		basicMaterial(color, opacity * 0.78, true),
	);
	group.add(glow, tube);
	parent.add(group);
	return { curve, group, tube };
}

function addOrbit(graph, parent, options) {
	const points = [];
	const segments = 72;
	for (let index = 0; index < segments; index += 1) {
		const angle = (index / segments) * Math.PI * 2;
		points.push(new THREE.Vector3(
			Math.cos(angle) * options.radius,
			Math.sin(angle) * options.radius * options.yScale,
			Math.sin(angle * 1.7) * options.depth,
		));
	}
	const group = new THREE.Group();
	group.rotation.set(options.tilt || 0, options.yaw || 0, options.roll || 0);
	parent.add(group);
	const path = addTubePath(graph, group, points, options.color, options.thickness || 0.012, options.opacity || 0.5, true);
	return { ...path, group };
}

function addFlow(graph, parent, curve, color, speed = 0.08, size = 0.05, phase = 0) {
	const particle = new THREE.Sprite(new THREE.SpriteMaterial({
		map: getGlowTexture(),
		color,
		transparent: true,
		opacity: 0.72,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}));
	particle.scale.setScalar(size * 4.2);
	parent.add(particle);
	graph.userData.flows.push({ particle, curve, speed, phase });
	return particle;
}

function addArchiveRing(graph, parent, radius, color, position, rotation, opacity = 0.48) {
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(radius, 0.014, 10, 96),
		basicMaterial(color, opacity, true),
	);
	ring.position.set(...position);
	ring.rotation.set(...rotation);
	parent.add(ring);
	return ring;
}

function addArchiveSlab(graph, parent, size, position, color, rotation = [0, 0, 0]) {
	const slab = new THREE.Mesh(
		new THREE.BoxGeometry(size[0], size[1], size[2]),
		surfaceMaterial(graph, color, 0.16, 1),
	);
	slab.position.set(...position);
	slab.rotation.set(...rotation);
	parent.add(slab);
	return slab;
}

function buildHub(graph, small) {
	const root = new THREE.Group();
	root.scale.setScalar(small ? 0.9 : 1.18);
	root.position.set(0.05, 0.04, 0.18);
	graph.add(root);
	addGridFloor(graph, root, COLORS.cyan, -1.42, -0.82, 0.11);

	const globe = new THREE.Group();
	root.add(globe);
	const atmosphere = new THREE.Mesh(
		new THREE.SphereGeometry(0.76, 40, 28),
		surfaceMaterial(graph, COLORS.cyan, 0.12, 0),
	);
	const sphere = new THREE.Mesh(
		new THREE.SphereGeometry(0.61, 48, 32),
		surfaceMaterial(graph, COLORS.green, 0.5, 1, THREE.NormalBlending),
	);
	const core = new THREE.Mesh(
		new THREE.SphereGeometry(0.17, 24, 18),
		surfaceMaterial(graph, COLORS.green, 0.95, 2),
	);
	globe.add(atmosphere, sphere);
	addSphericalParticles(graph, globe, 0.64, small ? 70 : 170, 517, 0.76);
	globe.add(core);
	const globeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
		map: getGlowTexture(),
		color: COLORS.green,
		transparent: true,
		opacity: 0.15,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}));
	globeGlow.scale.setScalar(0.95);
	globe.add(globeGlow);

	const orbitSpecs = [
		{ radius: 1.03, yScale: 0.35, depth: 0.18, tilt: 0.28, yaw: -0.18, color: COLORS.green, opacity: 0.72 },
		{ radius: 1.34, yScale: 0.3, depth: 0.26, tilt: -0.35, yaw: 0.2, color: COLORS.cyan, opacity: 0.62 },
		{ radius: 1.66, yScale: 0.24, depth: 0.32, tilt: 0.58, yaw: -0.38, color: COLORS.violet, opacity: 0.48 },
		{ radius: 1.9, yScale: 0.18, depth: 0.38, tilt: -0.1, yaw: 0.48, color: COLORS.green, opacity: 0.34 },
	];
	const orbits = orbitSpecs.map((options) => addOrbit(graph, root, options));
	const nodes = [
		[0, 1.03, 0, COLORS.green, 0.1, 1.2],
		[0.74, 0.4, 0.12, COLORS.cyan, 0.07, 0.85],
		[-1.1, -0.35, 0.18, COLORS.violet, 0.085, 1.05],
		[1.46, 0.12, -0.16, COLORS.cyan, 0.12, 1.25],
		[-1.72, 0.02, 0.32, COLORS.green, 0.08, 0.92],
	];
	nodes.forEach(([x, y, z, color, size, emphasis], index) => {
		const node = addGlowNode(graph, root, new THREE.Vector3(x, y, z), color, size, emphasis);
		graph.userData.breathing.push({ node, amount: index === 3 ? 0.065 : 0.035 });
	});
	orbits.forEach((orbit, index) => {
		addFlow(graph, orbit.group, orbit.curve, orbitSpecs[index].color, 0.012 + index * 0.002, 0.045, index * 0.19);
	});
	graph.userData.update = (elapsed, pointer) => {
		globe.rotation.y = elapsed * 0.055;
		globe.rotation.x = Math.sin(elapsed * 0.18) * 0.035;
		root.rotation.y = pointer.x * 0.045 + Math.sin(elapsed * 0.06) * 0.025;
		root.rotation.x = pointer.y * 0.025;
		orbits.forEach((orbit, index) => {
			orbit.group.rotation.z += (index % 2 ? -1 : 1) * 0.00045;
		});
	};
}

function buildCareer(graph, small) {
	const root = new THREE.Group();
	root.scale.setScalar(small ? 0.9 : 1.22);
	root.position.set(0, -0.02, 0.12);
	graph.add(root);
	addGridFloor(graph, root, COLORS.cyan, -1.35, -0.62, 0.09);

	const main = addTubePath(graph, root, [
		new THREE.Vector3(-2.15, -0.98, 0.36),
		new THREE.Vector3(-1.36, -0.67, 0.2),
		new THREE.Vector3(-0.42, -0.18, 0.5),
		new THREE.Vector3(0.56, 0.38, 0.68),
		new THREE.Vector3(1.76, 1.08, 0.42),
	], COLORS.green, 0.018, 0.72);
	const branch = addTubePath(graph, root, [
		new THREE.Vector3(-0.42, -0.18, 0.5),
		new THREE.Vector3(-0.12, 0.26, -0.32),
		new THREE.Vector3(0.25, 0.86, -0.05),
		new THREE.Vector3(0.87, 1.28, 0.34),
	], COLORS.cyan, 0.014, 0.55);
	const learning = addTubePath(graph, root, [
		new THREE.Vector3(0.56, 0.38, 0.68),
		new THREE.Vector3(0.96, 0.04, 0.04),
		new THREE.Vector3(1.4, -0.28, -0.42),
	], COLORS.violet, 0.012, 0.48);
	const huawei = addGlowNode(graph, root, new THREE.Vector3(-2.15, -0.98, 0.38), COLORS.green, 0.29, 1.55, 'Huawei');
	const okx = addGlowNode(graph, root, new THREE.Vector3(0.56, 0.38, 0.7), COLORS.cyan, 0.24, 1.25, 'OKX');
	const nodes = [
		[new THREE.Vector3(-0.42, -0.18, 0.5), COLORS.cyan, 0.13],
		[new THREE.Vector3(0.25, 0.86, -0.05), COLORS.violet, 0.145],
		[new THREE.Vector3(0.87, 1.28, 0.34), COLORS.white, 0.1],
		[new THREE.Vector3(1.4, -0.28, -0.42), COLORS.violet, 0.11],
		[new THREE.Vector3(1.76, 1.08, 0.42), COLORS.green, 0.09],
	];
	nodes.forEach(([position, color, size], index) => {
		const node = addGlowNode(graph, root, position, color, size, index === 1 ? 1.05 : 0.78);
		graph.userData.breathing.push({ node, amount: index === 1 ? 0.07 : 0.032 });
	});
	graph.userData.breathing.push({ node: huawei, amount: 0.06 }, { node: okx, amount: 0.055 });
	addFlow(graph, root, main.curve, COLORS.green, 0.013, 0.052, 0.05);
	addFlow(graph, root, branch.curve, COLORS.cyan, 0.011, 0.043, 0.64);
	addFlow(graph, root, learning.curve, COLORS.violet, 0.01, 0.038, 0.32);
	graph.userData.update = (elapsed, pointer) => {
		root.rotation.y = pointer.x * 0.06 + Math.sin(elapsed * 0.04) * 0.018;
		root.rotation.x = pointer.y * 0.035;
		root.position.y = -0.02 + Math.sin(elapsed * 0.04) * 0.02;
	};
}

function addZonePlate(parent, size, position, color, rotation = [0, 0, 0]) {
	const group = new THREE.Group();
	group.position.set(...position);
	group.rotation.set(...rotation);
	const plate = new THREE.Mesh(
		new THREE.PlaneGeometry(size[0], size[1]),
		basicMaterial(color, 0.08, true, THREE.DoubleSide),
	);
	plate.rotation.x = -Math.PI / 2;
	group.add(plate);
	const spine = new THREE.Mesh(
		new THREE.BoxGeometry(size[0], 0.018, 0.018),
		basicMaterial(color, 0.25, true),
	);
	spine.position.set(0, 0.05, -size[1] * 0.5);
	group.add(spine);
	parent.add(group);
	return group;
}

function addServiceVolume(graph, parent, size, position, color, rotation = [0, 0, 0]) {
	const group = new THREE.Group();
	group.position.set(...position);
	group.rotation.set(...rotation);
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(size[0], size[1], size[2]),
		surfaceMaterial(graph, color, 0.18, 1),
	);
	const cap = new THREE.Mesh(
		new THREE.PlaneGeometry(size[0] * 0.82, size[2] * 0.82),
		basicMaterial(color, 0.22, true, THREE.DoubleSide),
	);
	cap.rotation.x = -Math.PI / 2;
	cap.position.y = size[1] * 0.5;
	group.add(body, cap);
	parent.add(group);
	return group;
}

function buildProjects(graph, small) {
	const root = new THREE.Group();
	root.scale.setScalar(small ? 0.84 : 1.1);
	root.position.set(0, -0.08, 0.15);
	graph.add(root);
	addGridFloor(graph, root, COLORS.cyan, -1.42, -0.72, 0.1);
	addZonePlate(root, [2.8, 1.55], [-0.7, 0.02, 0.18], COLORS.cyan, [0, 0.1, 0]);
	addZonePlate(root, [1.7, 1.1], [1.04, 0.48, -0.34], COLORS.violet, [0, -0.16, 0]);
	addZonePlate(root, [3.8, 1.4], [-0.1, -0.72, -0.6], COLORS.green, [0, 0.08, 0]);
	addServiceVolume(graph, root, [0.74, 0.52, 0.64], [-0.76, 0.28, 0.18], COLORS.cyan, [0.02, 0.12, -0.03]);
	addServiceVolume(graph, root, [0.58, 0.42, 0.52], [0.82, 0.58, -0.28], COLORS.violet, [-0.05, -0.18, 0.04]);
	addServiceVolume(graph, root, [0.46, 0.66, 0.46], [0.04, -0.05, 0.58], COLORS.green, [0.03, 0.06, 0]);
	addServiceVolume(graph, root, [0.36, 0.82, 0.36], [0.3, 0.34, 0.2], COLORS.green, [0.02, -0.04, 0.02]);

	const nodes = {
		api: addGlowNode(graph, root, new THREE.Vector3(-1.58, 0.4, 0.58), COLORS.cyan, 0.2, 1.3),
		worker: addGlowNode(graph, root, new THREE.Vector3(-0.68, 0.02, 0.2), COLORS.green, 0.17, 1.15),
		database: addGlowNode(graph, root, new THREE.Vector3(0.08, -0.48, 0.6), COLORS.violet, 0.16, 1),
		control: addGlowNode(graph, root, new THREE.Vector3(0.78, 0.64, -0.18), COLORS.cyan, 0.22, 1.35),
		cloud: addGlowNode(graph, root, new THREE.Vector3(1.78, 0.98, 0.72), COLORS.green, 0.17, 1.12),
		telemetry: addGlowNode(graph, root, new THREE.Vector3(1.55, -0.68, -0.52), COLORS.violet, 0.12, 0.9),
	};
	Object.values(nodes).forEach((node, index) => graph.userData.breathing.push({ node, amount: index === 3 ? 0.07 : 0.035 }));
	const routes = [
		[[-1.58, 0.4, 0.58], [-0.68, 0.02, 0.2], [0.08, -0.48, 0.6]],
		[[-0.68, 0.02, 0.2], [0.78, 0.64, -0.18], [1.78, 0.98, 0.72]],
		[[0.08, -0.48, 0.6], [0.82, -0.12, 0.08], [1.55, -0.68, -0.52]],
		[[0.78, 0.64, -0.18], [1.12, 0.84, 0.48], [1.78, 0.98, 0.72]],
	];
	const routeColors = [COLORS.cyan, COLORS.green, COLORS.violet, COLORS.cyan];
	routes.forEach((points, index) => {
		const route = addTubePath(graph, root, points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), routeColors[index], 0.016, 0.54);
		addFlow(graph, root, route.curve, routeColors[index], 0.014 - index * 0.0012, 0.045, index * 0.23);
	});
	graph.userData.update = (elapsed, pointer) => {
		root.rotation.y = pointer.x * 0.05 + Math.sin(elapsed * 0.05) * 0.045;
		root.rotation.x = pointer.y * 0.025;
	};
}

function buildVault(graph, small) {
	const root = new THREE.Group();
	root.scale.setScalar(small ? 0.92 : 1.2);
	root.position.set(0, -0.02, 0.1);
	graph.add(root);
	addGridFloor(graph, root, COLORS.violet, -1.3, -0.7, 0.06);

	const pedestal = new THREE.Mesh(
		new THREE.CylinderGeometry(1.18, 1.32, 0.08, 64),
		basicMaterial(COLORS.cyan, 0.08, true),
	);
	pedestal.position.y = -1.05;
	root.add(pedestal);
	const seal = new THREE.Group();
	seal.position.set(0, 0.06, 0.2);
	root.add(seal);
	addArchiveSlab(graph, root, [0.62, 1.2, 0.025], [-0.02, 0.12, -0.46], COLORS.cyan, [0.08, 0.18, 0.04]);
	addArchiveSlab(graph, root, [0.76, 0.025, 1.12], [0.06, 0.02, 0.2], COLORS.violet, [0.14, -0.24, -0.08]);
	addArchiveSlab(graph, root, [0.025, 1.0, 0.66], [0.48, 0.08, 0.04], COLORS.green, [-0.12, 0.2, 0.18]);
	const outerShell = new THREE.Mesh(
		new THREE.SphereGeometry(0.56, 36, 24),
		surfaceMaterial(graph, COLORS.green, 0.34, 1),
	);
	const diamond = new THREE.Mesh(
		new THREE.OctahedronGeometry(0.28, 2),
		surfaceMaterial(graph, COLORS.cyan, 0.72, 2),
	);
	const sealGlow = new THREE.Sprite(new THREE.SpriteMaterial({
		map: getGlowTexture(),
		color: COLORS.green,
		transparent: true,
		opacity: 0.14,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}));
	sealGlow.scale.setScalar(0.98);
	seal.add(outerShell, sealGlow, diamond);
	seal.scale.setScalar(1.14);
	addSphericalParticles(graph, seal, 0.58, small ? 46 : 110, 811, 0.62);
	const rings = [
		addArchiveRing(graph, root, 0.88, COLORS.cyan, [0, -0.28, -0.28], [0.48, 0.18, 0.12], 0.52),
		addArchiveRing(graph, root, 0.7, COLORS.violet, [0.02, 0.05, 0.04], [1.08, -0.28, -0.35], 0.42),
		addArchiveRing(graph, root, 0.52, COLORS.green, [-0.02, 0.2, 0.38], [0.18, 0.72, 0.08], 0.66),
	];
	const records = [
		[-1.25, 0.74, -0.48, COLORS.cyan, 0.052],
		[1.22, 0.58, -0.08, COLORS.green, 0.06],
		[-1.08, -0.64, 0.26, COLORS.violet, 0.045],
		[1.18, -0.52, 0.6, COLORS.cyan, 0.038],
		[0.76, 1.04, -0.7, COLORS.white, 0.032],
	];
	records.forEach(([x, y, z, color, size]) => {
		const node = addGlowNode(graph, root, new THREE.Vector3(x, y, z), color, size, 0.75);
		graph.userData.breathing.push({ node, amount: 0.032 });
	});
	const verification = addTubePath(graph, root, [
		new THREE.Vector3(-1.34, -0.1, -0.42),
		new THREE.Vector3(-0.68, 0.28, 0.18),
		new THREE.Vector3(0.02, 0.06, 0.22),
		new THREE.Vector3(0.84, 0.56, 0.14),
		new THREE.Vector3(1.34, 0.18, 0.7),
	], COLORS.green, 0.01, 0.36);
	addFlow(graph, root, verification.curve, COLORS.green, 0.01, 0.038, 0.2);
	graph.userData.update = (elapsed, pointer) => {
		seal.rotation.y = elapsed * 0.045;
		seal.rotation.x = pointer.y * 0.025;
		root.rotation.y = pointer.x * 0.04;
		rings[0].rotation.z = elapsed * 0.012;
		rings[1].rotation.x = 1.08 + Math.sin(elapsed * 0.025) * 0.03;
		rings[2].rotation.y = 0.72 - elapsed * 0.016;
	};
}

function buildLab(graph, small) {
	const root = new THREE.Group();
	root.scale.setScalar(small ? 0.88 : 1.12);
	root.position.set(0, 0.04, 0.1);
	graph.add(root);
	addGridFloor(graph, root, COLORS.cyan, -1.38, -0.8, 0.08);

	const platform = new THREE.Mesh(
		new THREE.CylinderGeometry(1.7, 1.88, 0.1, 72, 1, true),
		basicMaterial(COLORS.cyan, 0.11, true, THREE.DoubleSide),
	);
	platform.position.set(0, -1.27, -0.1);
	root.add(platform);
	const upperDeck = new THREE.Mesh(
		new THREE.CylinderGeometry(0.72, 0.84, 0.08, 56, 1, true),
		basicMaterial(COLORS.violet, 0.12, true, THREE.DoubleSide),
	);
	upperDeck.position.set(0, -0.32, 0.08);
	upperDeck.rotation.z = -0.12;
	root.add(upperDeck);
	const platformRing = new THREE.Mesh(
		new THREE.TorusGeometry(1.45, 0.018, 10, 96),
		basicMaterial(COLORS.green, 0.72, true),
	);
	platformRing.rotation.x = Math.PI / 2;
	platformRing.position.y = -1.21;
	root.add(platformRing);

	const core = new THREE.Mesh(
		new THREE.IcosahedronGeometry(0.58, 3),
		surfaceMaterial(graph, COLORS.cyan, 0.68, 2),
	);
	core.position.set(0, 0.28, 0.2);
	root.add(core);
	addSphericalParticles(graph, root, 0.58, small ? 70 : 155, 1301, 0.62);
	const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
		map: getGlowTexture(),
		color: COLORS.cyan,
		transparent: true,
		opacity: 0.16,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	}));
	coreGlow.scale.setScalar(1.2);
	coreGlow.position.copy(core.position);
	root.add(coreGlow);
	const coreOrbit = addArchiveRing(graph, root, 0.72, COLORS.cyan, [0, 0.28, 0.2], [0.72, 0.18, 0.14], 0.34);

	const nodes = [
		[new THREE.Vector3(-1.7, -0.12, 0.82), COLORS.green, 0.11],
		[new THREE.Vector3(1.48, 0.62, -0.54), COLORS.violet, 0.13],
		[new THREE.Vector3(1.24, -0.72, 0.62), COLORS.cyan, 0.1],
		[new THREE.Vector3(-1.2, 1.18, -0.76), COLORS.cyan, 0.08],
	];
	nodes.forEach(([position, color, size], index) => {
		const node = addGlowNode(graph, root, position, color, size, index === 1 ? 1.18 : 0.85);
		graph.userData.breathing.push({ node, amount: 0.04 });
	});
	const paths = [
		[[-1.7, -0.12, 0.82], [-0.72, 0.18, 0.4], [0, 1.08, 0.28]],
		[[1.48, 0.62, -0.54], [0.62, 0.42, -0.04], [0, 0.28, 0.2]],
		[[1.24, -0.72, 0.62], [0.62, -0.84, 0.36], [0, -1.27, -0.1]],
	];
	const pathColors = [COLORS.green, COLORS.violet, COLORS.cyan];
	paths.forEach((points, index) => {
		const path = addTubePath(graph, root, points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), pathColors[index], 0.014, 0.56);
		addFlow(graph, root, path.curve, pathColors[index], 0.012, 0.044, index * 0.28);
	});
	const rings = [
		addArchiveRing(graph, root, 1.28, COLORS.cyan, [0, -1.23, 0], [Math.PI / 2, 0, 0], 0.68),
		addArchiveRing(graph, root, 0.98, COLORS.green, [0, -1.17, 0.03], [Math.PI / 2, 0.14, 0], 0.52),
		addArchiveRing(graph, root, 0.68, COLORS.violet, [0, -1.1, 0.08], [Math.PI / 2, -0.18, 0], 0.46),
	];
	graph.userData.update = (elapsed, pointer) => {
		root.rotation.y = pointer.x * 0.05 + Math.sin(elapsed * 0.045) * 0.025;
		root.rotation.x = pointer.y * 0.025;
		core.rotation.y = elapsed * 0.08;
		core.rotation.x = elapsed * 0.045;
		rings[0].rotation.z = elapsed * 0.009;
		rings[1].rotation.z = 0.14 - elapsed * 0.012;
		rings[2].rotation.z = -0.18 + elapsed * 0.016;
		coreOrbit.rotation.z = elapsed * 0.018;
	};
}

function createSceneGraph(kind, scene, small) {
	const graph = new THREE.Group();
	graph.userData.breathing = [];
	graph.userData.flows = [];
	graph.userData.dynamicMaterials = [];
	scene.add(graph);
	addBackdrop(graph, scene, small, kind === 'lab' ? 'galaxy' : kind === 'hub' ? 'galaxy' : 'deep');
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

function updateScene(graph, elapsed, pointer, hovered) {
	graph.userData.dynamicMaterials.forEach((material) => {
		if (material.uniforms?.uTime) material.uniforms.uTime.value = elapsed;
	});
	graph.userData.breathing.forEach(({ node, amount }) => {
		const phase = node.userData.phase || 0;
		node.scale.setScalar(1 + Math.sin(elapsed * 0.65 + phase) * amount);
		if (node.userData.ring) node.userData.ring.rotation.z += 0.002;
	});
	graph.userData.flows.forEach(({ particle, curve, speed, phase }) => {
		const t = (phase + elapsed * speed) % 1;
		particle.position.copy(curve.getPointAt(t < 0 ? t + 1 : t));
	});
	graph.userData.update?.(elapsed, pointer, hovered);
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
	scene.fog = new THREE.FogExp2(0x020a12, small ? 0.018 : 0.014);
	const camera = new THREE.PerspectiveCamera(kind === 'career' ? 38 : 35, 1, 0.1, 100);
	camera.position.set(0, 0.08, kind === 'lab' ? 8.8 : kind === 'vault' ? 8.2 : 7.8);
	camera.lookAt(0, 0, 0);
	const renderer = new THREE.WebGLRenderer({
		canvas,
		alpha: true,
		antialias: !small,
		powerPreference: 'high-performance',
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
	renderer.setClearColor(0x000000, 0);
	if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping !== undefined) {
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.12;
	}
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
	if (typeof renderer.compile === 'function') renderer.compile(scene, camera);
	renderer.render(scene, camera);

	const render = (now) => {
		frameId = requestAnimationFrame(render);
		const delta = Math.min((now - lastTime) / 1000, 0.05);
		lastTime = now;
		if (hidden) return;
		const elapsed = reducedMotion.matches ? 0 : (now - clockStart) / 1000;
		targetPointer.multiplyScalar(0.96);
		pointer.lerp(targetPointer, reducedMotion.matches ? 0.12 : 0.035);
		camera.position.x += (pointer.x * 0.16 - camera.position.x) * 0.035;
		camera.position.y += (0.08 + pointer.y * 0.12 - camera.position.y) * 0.035;
		camera.lookAt(0, 0, 0);
		updateScene(graph, elapsed + delta * 0.01, pointer, hovered);
		renderer.render(scene, camera);
	};
	canvas.dataset.sceneMounted = 'true';
	frame?.classList.add('scene-ready');
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

function setLiveTimes() {
	const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	document.querySelectorAll('[data-live-time]').forEach((node) => { node.textContent = time; });
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
