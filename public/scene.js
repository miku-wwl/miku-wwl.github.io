import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const scenes = new Set();

const SCENE_CONFIG = {
	hub: { seed: 41, stars: 7200, dust: 620, radius: 8.7, thickness: 2.8, arms: 4, tightness: 0.78, armWeight: 0.7, accent: 0x20e6a0, drift: 0.006 },
	career: { seed: 73, stars: 6000, dust: 480, radius: 8.9, thickness: 1.9, arms: 3, tightness: 0.62, armWeight: 0.55, accent: 0x24dca0, drift: 0.003 },
	projects: { seed: 97, stars: 6500, dust: 540, radius: 9.2, thickness: 2.2, arms: 4, tightness: 0.48, armWeight: 0.47, accent: 0x21b9ed, drift: 0.004 },
	vault: { seed: 121, stars: 5600, dust: 470, radius: 8.8, thickness: 2.5, arms: 4, tightness: 0.54, armWeight: 0.52, accent: 0x23d9ad, drift: 0.003 },
	lab: { seed: 163, stars: 6400, dust: 600, radius: 9.4, thickness: 2.6, arms: 5, tightness: 0.5, armWeight: 0.48, accent: 0x26d6cf, drift: 0.005 },
};

const PALETTE = [
	new THREE.Color(0x8ccde5), new THREE.Color(0x28bde8), new THREE.Color(0x29dda6),
	new THREE.Color(0x9f70ef), new THREE.Color(0xd8f2f1),
];

function mulberry32(seed) {
	return function random() {
		let t = seed += 0x6d2b79f5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

function normalSample(random) {
	return Math.sqrt(-2 * Math.log(Math.max(0.0001, random()))) * Math.cos(TAU * random());
}

function registerMaterial(graph, material) {
	graph.userData.materials.push(material);
	return material;
}

function makeGlowTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 128;
	const ctx = canvas.getContext('2d');
	const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
	gradient.addColorStop(0, 'rgba(255,255,255,1)');
	gradient.addColorStop(0.08, 'rgba(255,255,255,.95)');
	gradient.addColorStop(0.26, 'rgba(120,255,220,.58)');
	gradient.addColorStop(0.56, 'rgba(40,210,190,.15)');
	gradient.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 128, 128);
	return new THREE.CanvasTexture(canvas);
}

let glowTexture;
function getGlowTexture() {
	if (!glowTexture) glowTexture = makeGlowTexture();
	return glowTexture;
}

const letterTextures = new Map();
function getLetterTexture(letter, color = '#dffcf5') {
	const key = `${letter}:${color}`;
	if (letterTextures.has(key)) return letterTextures.get(key);
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 256;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, 256, 256);
	ctx.fillStyle = color;
	ctx.font = '700 170px ui-monospace, SFMono-Regular, Menlo, monospace';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(letter, 128, 135);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	letterTextures.set(key, texture);
	return texture;
}

const textTextures = new Map();
function addTextSprite(graph, parent, text, color, width, position) {
	const key = `${text}:${color}`;
	let texture = textTextures.get(key);
	if (!texture) {
		const canvas = document.createElement('canvas');
		canvas.width = 768;
		canvas.height = 96;
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
		ctx.font = '600 34px ui-monospace, SFMono-Regular, Menlo, monospace';
		ctx.letterSpacing = '4px';
		ctx.fillText(text, 8, 53);
		texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		textTextures.set(key, texture);
	}
	const sprite = new THREE.Sprite(registerMaterial(graph, new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false, toneMapped: false })));
	sprite.scale.set(width, width * 0.125, 1);
	sprite.position.copy(position);
	sprite.renderOrder = 6;
	parent.add(sprite);
	return sprite;
}

function lineMaterial(graph, color, opacity = 0.45) {
	return registerMaterial(graph, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
}

function makeParticleMaterial(graph, options = {}) {
	const material = new THREE.ShaderMaterial({
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
		uniforms: { uTime: { value: 0 }, uOpacity: { value: options.opacity ?? 1 }, uPixelRatio: { value: options.pixelRatio ?? 1 }, uSpeed: { value: options.speed ?? 0.004 } },
		vertexShader: `
			attribute float aSize;
			attribute float aSeed;
			varying vec3 vColor;
			varying float vSeed;
			uniform float uTime;
			uniform float uPixelRatio;
			uniform float uSpeed;
			void main() {
				vec3 p = position;
				float radius = length(p.xz);
				float phase = uTime * uSpeed * (0.7 + 1.0 / (1.0 + radius * 0.14)) + aSeed * 6.2831;
				float c = cos(phase) * 0.004;
				float s = sin(phase) * 0.004;
				p.xz = mat2(cos(c), -sin(c), sin(c), cos(c)) * p.xz;
				p.y += sin(uTime * 0.17 + aSeed * 8.0) * 0.006;
				vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
				gl_Position = projectionMatrix * mvPosition;
				gl_PointSize = clamp(aSize * uPixelRatio * (92.0 / max(1.0, -mvPosition.z)), 0.85, 9.0);
				vColor = color;
				vSeed = aSeed;
			}
		`,
		fragmentShader: `
			varying vec3 vColor;
			varying float vSeed;
			uniform float uTime;
			uniform float uOpacity;
			void main() {
				vec2 uv = gl_PointCoord - 0.5;
				float d = length(uv) * 2.0;
				if (d > 1.0) discard;
				float core = smoothstep(0.42, 0.0, d);
				float halo = smoothstep(1.0, 0.12, d);
				float twinkle = 0.82 + 0.18 * sin(uTime * 0.55 + vSeed * 31.0);
				float alpha = (core * 0.96 + halo * 0.24) * uOpacity * twinkle;
				gl_FragColor = vec4(vColor * (0.38 + core * 1.35), alpha);
			}
		`,
		toneMapped: false,
	});
	return registerMaterial(graph, material);
}

function addParticles(graph, parent, data, options = {}) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
	geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(data.sizes, 1));
	geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(data.seeds, 1));
	const material = makeParticleMaterial(graph, options);
	const points = new THREE.Points(geometry, material);
	points.frustumCulled = false;
	points.renderOrder = options.renderOrder ?? 1;
	parent.add(points);
	graph.userData.particleMaterials.push(material);
	return points;
}

function pickStarColor(random, intensity) {
	const sample = random();
	let color;
	if (sample > 0.985) color = PALETTE[4];
	else if (sample > 0.91) color = PALETTE[3];
	else if (sample > 0.7) color = PALETTE[2];
	else if (sample > 0.42) color = PALETTE[1];
	else color = PALETTE[0];
	return [color.r * intensity, color.g * intensity, color.b * intensity];
}

function spiralPosition(random, config) {
	const radius = Math.pow(random(), 0.56) * config.radius;
	const arm = Math.floor(random() * config.arms);
	const armAngle = arm * TAU / config.arms;
	const spiralAngle = (radius / config.radius) * config.tightness * TAU;
	const angle = armAngle + spiralAngle + normalSample(random) * (0.08 + radius * 0.08);
	return [
		Math.cos(angle) * radius,
		normalSample(random) * config.thickness * (0.15 + (1 - radius / config.radius) * 0.35),
		-3.4 + Math.sin(angle) * radius * 0.72 + normalSample(random) * (0.6 + radius * 0.13),
	];
}

function deepPosition(random, config) {
	return [normalSample(random) * config.radius * 0.72, normalSample(random) * config.thickness * 1.15, -2.2 - Math.pow(random(), 0.62) * 12];
}

class GalaxyField {
	constructor(graph, kind, small) {
		this.graph = graph;
		this.config = SCENE_CONFIG[kind];
		this.group = new THREE.Group();
		this.group.name = `${kind}-galaxy-field`;
		this.group.position.z = -0.1;
		graph.add(this.group);
		this.build(small);
	}

	build(small) {
		const config = this.config;
		const random = mulberry32(config.seed);
		const density = small ? 0.36 : 1;
		const starCount = Math.max(900, Math.round(config.stars * density));
		const positions = [], colors = [], sizes = [], seeds = [];
		for (let i = 0; i < starCount; i += 1) {
			const point = random() < config.armWeight ? spiralPosition(random, config) : deepPosition(random, config);
			positions.push(point[0], point[1], point[2]);
			const bright = 0.42 + Math.pow(random(), 4) * 2.1;
			const color = pickStarColor(random, bright);
			colors.push(color[0], color[1], color[2]);
			sizes.push(0.08 + Math.pow(random(), 6) * 1.9);
			seeds.push(random());
		}
		addParticles(this.graph, this.group, { positions, colors, sizes, seeds }, { opacity: 0.85, speed: config.drift, pixelRatio: 1, renderOrder: 1 });

		const dustCount = Math.max(120, Math.round(config.dust * density));
		const dustPositions = [], dustColors = [], dustSizes = [], dustSeeds = [];
		for (let i = 0; i < dustCount; i += 1) {
			const point = spiralPosition(random, config);
			dustPositions.push(point[0] * 0.82, point[1] * 1.32, point[2] - random() * 1.5);
			const color = random() > 0.48 ? new THREE.Color(0x1c9f9c) : new THREE.Color(0x315d87);
			const intensity = 0.18 + random() * 0.28;
			dustColors.push(color.r * intensity, color.g * intensity, color.b * intensity);
			dustSizes.push(0.5 + random() * 2.2);
			dustSeeds.push(random());
		}
		addParticles(this.graph, this.group, { positions: dustPositions, colors: dustColors, sizes: dustSizes, seeds: dustSeeds }, { opacity: 0.48, speed: config.drift * 0.5, pixelRatio: 1, renderOrder: 0 });
	}

	update(time, pointer) {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		this.group.position.x = pointer.x * 0.07;
		this.group.position.y = pointer.y * 0.035;
		this.group.rotation.y = Math.sin(time * 0.045) * 0.015 * motion;
		this.group.rotation.x = Math.sin(time * 0.032) * 0.008 * motion;
		for (const material of this.graph.userData.particleMaterials) material.uniforms.uTime.value = time * motion;
	}
}

function addPerspectiveGrid(graph, opacity = 0.16, color = 0x08708d) {
	const vertices = [];
	const floorY = -1.55;
	const nearZ = -1.2;
	const farZ = -15;
	for (let x = -10; x <= 10; x += 1) vertices.push(x, floorY, nearZ, x * 0.22, floorY, farZ);
	for (let z = nearZ; z >= farZ; z -= 0.9) {
		const width = 1.3 + (-z - 1) * 0.52;
		vertices.push(-width, floorY, z, width, floorY, z);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	const grid = new THREE.LineSegments(geometry, lineMaterial(graph, color, opacity));
	grid.renderOrder = 0;
	graph.add(grid);
}

function addNetworkLandscape(graph, kind, opacity = 0.1) {
	const random = mulberry32(SCENE_CONFIG[kind].seed + 900);
	const vertices = [];
	const columns = 15;
	const rows = 7;
	const points = [];
	for (let row = 0; row < rows; row += 1) {
		const rowPoints = [];
		for (let col = 0; col < columns; col += 1) {
			const x = (col / (columns - 1) - 0.5) * 15;
			const z = -2.5 - row * 1.35;
			const y = -0.9 + Math.sin(col * 0.62 + row * 0.7) * 0.12 + (random() - 0.5) * 0.1;
			rowPoints.push(new THREE.Vector3(x, y, z));
		}
		points.push(rowPoints);
	}
	for (let row = 0; row < rows; row += 1) {
		for (let col = 0; col < columns - 1; col += 1) {
			const a = points[row][col];
			const b = points[row][col + 1];
			vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
			if (row < rows - 1 && col % 2 === 0) {
				const c = points[row + 1][col];
				vertices.push(a.x, a.y, a.z, c.x, c.y, c.z);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	graph.add(new THREE.LineSegments(geometry, lineMaterial(graph, 0x12617c, opacity)));
}

function addGlowSprite(graph, parent, color, size, opacity = 0.55) {
	const sprite = new THREE.Sprite(registerMaterial(graph, new THREE.SpriteMaterial({ map: getGlowTexture(), color, transparent: true, opacity, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
	sprite.scale.setScalar(size);
	sprite.renderOrder = 5;
	parent.add(sprite);
	return sprite;
}

function createNode(graph, parent, position, color, size = 0.12, label = '') {
	const node = new THREE.Group();
	node.position.copy(position);
	node.name = label || 'topology-node';
	const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 16, 10), registerMaterial(graph, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })));
	const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.52, Math.max(0.008, size * 0.045), 8, 32), registerMaterial(graph, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
	node.add(core, ring);
	addGlowSprite(graph, node, color, size * 2.2, 0.22);
	parent.add(node);
	graph.userData.animations.push((time) => { ring.scale.setScalar(1 + Math.sin(time * 0.7 + position.x * 3.1) * 0.05); });
	return node;
}

function addPath(graph, parent, points, color, opacity = 0.65, flow = false) {
	const curve = new THREE.CatmullRomCurve3(points);
	const lineGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
	parent.add(new THREE.Line(lineGeometry, lineMaterial(graph, color, opacity * 0.22)));
	parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(36)), lineMaterial(graph, color, opacity)));
	if (flow) {
		const tracer = addGlowSprite(graph, parent, color, 0.18, 0.52);
		const phase = Math.random();
		graph.userData.animations.push((time) => tracer.position.copy(curve.getPointAt((phase + time * 0.045) % 1)));
	}
	return curve;
}

function addOrbit(graph, parent, radius, color, rotation, opacity = 0.46) {
	const curve = new THREE.EllipseCurve(0, 0, radius, radius * 0.31, 0, TAU, false, 0);
	const points = curve.getPoints(96).map((point) => new THREE.Vector3(point.x, point.y, 0));
	const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial(graph, color, opacity));
	orbit.rotation.set(rotation.x, rotation.y, rotation.z);
	orbit.renderOrder = 2;
	parent.add(orbit);
	graph.userData.animations.push((time) => { orbit.rotation.z = rotation.z + Math.sin(time * 0.08) * 0.035 * (reducedMotionQuery.matches ? 0.12 : 1); });
	return orbit;
}

function planetMaterial(graph, color, deep) {
	return registerMaterial(graph, new THREE.ShaderMaterial({
		transparent: true,
		uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) } },
		vertexShader: `varying vec3 vNormal; varying vec3 vLocal; varying vec3 vWorld; void main(){vNormal=normalize(normalMatrix*normal);vLocal=position;vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
		fragmentShader: `
			uniform float uTime; uniform vec3 uColor; uniform vec3 uDeep;
			varying vec3 vNormal; varying vec3 vLocal; varying vec3 vWorld;
			float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
			float noise(vec3 p){vec3 i=floor(p);vec3 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
			float fbm(vec3 p){float value=0.0;float amp=0.5;for(int i=0;i<4;i++){value+=amp*noise(p);p*=2.03;amp*=0.5;}return value;}
			void main(){vec3 n=normalize(vLocal);float cloud=fbm(n*4.2+vec3(uTime*.018,-uTime*.011,0.0));float detail=fbm(n*12.0-vec3(0.0,uTime*.025,0.0));float light=max(dot(vNormal,normalize(vec3(-.45,.55,.9))),0.0);float rim=pow(1.0-max(dot(vNormal,normalize(cameraPosition-vWorld)),0.0),2.7);vec3 surface=mix(uDeep,uColor,smoothstep(.28,.72,cloud));surface+=uColor*smoothstep(.68,.9,detail)*.22;gl_FragColor=vec4(surface*(.24+light*.92)+uColor*rim*.62,.95);}`,
		toneMapped: false,
	}));
}

function addPlanet(graph, parent, options = {}) {
	const radius = options.radius ?? 0.7;
	const planet = new THREE.Group();
	planet.position.copy(options.position ?? new THREE.Vector3());
	planet.name = options.name || 'glowing-planet-node';
	const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), planetMaterial(graph, options.color ?? 0x20e6a0, options.deep ?? 0x063c47));
	planet.add(body);
	const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 32, 24), registerMaterial(graph, new THREE.ShaderMaterial({
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		uniforms: { uColor: { value: new THREE.Color(options.color ?? 0x20e6a0) } },
		vertexShader: 'varying vec3 vNormal; void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
		fragmentShader: 'uniform vec3 uColor; varying vec3 vNormal; void main(){float rim=pow(1.0-max(vNormal.z,0.0),2.0);gl_FragColor=vec4(uColor,rim*.24);}',
		toneMapped: false,
	})));
	atmosphere.renderOrder = 3;
	planet.add(atmosphere);
	addGlowSprite(graph, planet, options.color ?? 0x20e6a0, radius * 3.2, 0.21);
	const shellRandom = mulberry32((options.seed ?? 13) + 500);
	const shell = { positions: [], colors: [], sizes: [], seeds: [] };
	for (let i = 0; i < 260; i += 1) {
		const theta = TAU * shellRandom();
		const phi = Math.acos(2 * shellRandom() - 1);
		const r = radius * (1.005 + shellRandom() * 0.018);
		shell.positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
		const c = new THREE.Color(options.color ?? 0x20e6a0);
		const intensity = 0.42 + shellRandom() * 0.5;
		shell.colors.push(c.r * intensity, c.g * intensity, c.b * intensity);
		shell.sizes.push(0.08 + shellRandom() * 0.35);
		shell.seeds.push(shellRandom());
	}
	addParticles(graph, planet, shell, { opacity: 0.5, speed: 0.012, pixelRatio: 1, renderOrder: 4 });
	if (options.letter) {
		const label = new THREE.Sprite(registerMaterial(graph, new THREE.SpriteMaterial({ map: getLetterTexture(options.letter, '#dffff5'), transparent: true, depthTest: false, depthWrite: false, toneMapped: false })));
		label.scale.setScalar(radius * 0.68);
		label.position.z = radius * 1.05;
		label.renderOrder = 7;
		planet.add(label);
	}
	parent.add(planet);
	graph.userData.animations.push((time) => {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		planet.rotation.y = time * 0.018 * motion;
		planet.rotation.x = Math.sin(time * 0.07) * 0.06 * motion;
		if (body.material.uniforms?.uTime) body.material.uniforms.uTime.value = time * motion;
	});
	return planet;
}

function addWireCube(graph, parent, options = {}) {
	const group = new THREE.Group();
	group.position.copy(options.position ?? new THREE.Vector3());
	group.rotation.set(options.rotation?.x ?? 0, options.rotation?.y ?? 0, options.rotation?.z ?? 0);
	const size = options.size ?? 1.7;
	const color = options.color ?? 0x21b9ed;
	const shell = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), registerMaterial(graph, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.025, depthWrite: false, toneMapped: false })));
	const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)), lineMaterial(graph, color, options.opacity ?? 0.64));
	group.add(shell, edges);
	if (options.nested !== false) {
		const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size * 0.61, size * 0.61, size * 0.61)), lineMaterial(graph, options.innerColor ?? 0x9c68eb, 0.56));
		inner.rotation.set(0.18, -0.28, 0.24);
		inner.position.set(0.06, -0.02, 0.12);
		group.add(inner);
	}
	if (options.core) {
		const core = new THREE.Mesh(new THREE.BoxGeometry(size * 0.18, size * 0.18, size * 0.18), registerMaterial(graph, new THREE.MeshBasicMaterial({ color: options.core, toneMapped: false })));
		group.add(core);
		addGlowSprite(graph, group, options.core, size * 0.8, 0.45);
	}
	parent.add(group);
	graph.userData.animations.push((time) => {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		group.rotation.y += 0.00035 * motion;
		group.position.y = (options.position?.y ?? 0) + Math.sin(time * 0.21) * 0.035 * motion;
	});
	return group;
}

function buildHub(graph, small) {
	addPerspectiveGrid(graph, 0.16);
	const root = new THREE.Group();
	root.position.set(0.05, 0.12, -1.5);
	root.scale.setScalar(small ? 0.9 : 1.18);
	graph.add(root);
	addPlanet(graph, root, { radius: 0.82, color: 0x20e6a0, deep: 0x07565a, letter: 'W', seed: 41 });
	const orbitSpecs = [
		{ radius: 1.03, color: 0x27cce8, rotation: { x: 0.1, y: 0.12, z: 0.12 }, node: 0x27cce8 },
		{ radius: 1.3, color: 0x45e8b0, rotation: { x: -0.14, y: 0.18, z: -0.32 }, node: 0x42e8b0 },
		{ radius: 1.56, color: 0x9c68eb, rotation: { x: 0.22, y: -0.1, z: 0.46 }, node: 0x9c68eb },
		{ radius: 1.82, color: 0x74ddeb, rotation: { x: -0.28, y: 0.25, z: -0.18 }, node: 0x74ddeb },
	];
	orbitSpecs.forEach((spec, index) => {
		const orbit = addOrbit(graph, root, spec.radius, spec.color, spec.rotation, 0.4);
		const angle = [0.5, 2.4, 4.3, 5.45][index];
		const node = createNode(graph, orbit, new THREE.Vector3(Math.cos(angle) * spec.radius, Math.sin(angle) * spec.radius * 0.31, 0), spec.node, index === 0 ? 0.18 : 0.12);
		if (index === 0) node.position.z = 0.08;
	});
	addTextSprite(graph, root, 'SYSTEMS', 0x25c9eb, 0.9, new THREE.Vector3(-1.48, -0.92, 0.04));
	addTextSprite(graph, root, 'RELIABILITY', 0x36e5b2, 1.1, new THREE.Vector3(0.68, 1.1, 0.04));
	addTextSprite(graph, root, 'INNOVATION', 0x9c68eb, 1.05, new THREE.Vector3(1.42, -0.46, 0.04));
	graph.userData.animations.push((time) => {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		root.rotation.y = Math.sin(time * 0.09) * 0.08 * motion;
		root.rotation.x = Math.sin(time * 0.06) * 0.025 * motion;
	});
}

function buildCareer(graph, small) {
	addPerspectiveGrid(graph, 0.12);
	addNetworkLandscape(graph, 'career', 0.12);
	const root = new THREE.Group();
	root.position.set(0.72, 0.48, -1.45);
	root.scale.setScalar(small ? 0.7 : 0.84);
	graph.add(root);
	const center = addPlanet(graph, root, { radius: 0.46, color: 0x21c6e7, deep: 0x082b4c, letter: 'W', seed: 73 });
	const nodes = [new THREE.Vector3(-1.1, -0.64, 0.04), new THREE.Vector3(-0.12, 0.18, 0.12), new THREE.Vector3(0.84, 0.76, 0.0), new THREE.Vector3(1.25, -0.42, 0.12), new THREE.Vector3(1.56, 0.72, -0.02)];
	const nodeColors = [0x22dca1, 0x26c7ea, 0x9c68eb, 0x23dba0, 0xe1f5f2];
	const nodeObjects = nodes.map((position, index) => createNode(graph, root, position, nodeColors[index], index === 1 ? 0.16 : 0.11));
	addPath(graph, root, [nodes[0], nodes[1], new THREE.Vector3(0.25, 0.05, 0.1)], 0x24dca0, 0.68, true);
	addPath(graph, root, [new THREE.Vector3(0.25, 0.05, 0.1), nodes[2], nodes[4]], 0x24dca0, 0.58, false);
	addPath(graph, root, [new THREE.Vector3(0.08, 0.02, 0.16), nodes[3]], 0x9c68eb, 0.5, false);
	addOrbit(graph, center, 0.68, 0x2ad8c0, { x: 0.22, y: -0.18, z: 0.1 }, 0.3);
	addTextSprite(graph, root, 'SYSTEMS / 2021-2025', 0x25c9eb, 1.55, new THREE.Vector3(-0.62, -1.05, 0.04));
	addTextSprite(graph, root, 'RELIABILITY NODE', 0x35e5b1, 1.45, new THREE.Vector3(1.1, 1.22, 0.04));
	addTextSprite(graph, root, 'LEARNING VECTOR', 0x9c68eb, 1.42, new THREE.Vector3(1.25, -0.78, 0.04));
	graph.userData.animations.push((time) => {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		root.rotation.y = Math.sin(time * 0.05) * 0.045 * motion;
		root.position.y = 0.48 + Math.sin(time * 0.16) * 0.02 * motion;
		nodeObjects.forEach((node, index) => { node.rotation.z = time * (index % 2 ? 0.008 : -0.006) * motion; });
	});
}

function buildProjects(graph, small) {
	addPerspectiveGrid(graph, 0.22, 0x076a90);
	addNetworkLandscape(graph, 'projects', 0.06);
	const root = new THREE.Group();
	root.position.set(-0.24, 0.05, -1.55);
	root.scale.setScalar(small ? 0.7 : 0.86);
	graph.add(root);
	addWireCube(graph, root, { position: new THREE.Vector3(-0.48, 0.28, 0), size: 1.62, color: 0x21b9ed, innerColor: 0x9c68eb, core: 0x25d9c5, rotation: { x: 0.18, y: -0.32, z: 0.05 }, opacity: 0.64 });
	const points = [new THREE.Vector3(-1.25, 0.78, 0.18), new THREE.Vector3(-0.05, 0.46, 0.1), new THREE.Vector3(1.08, 0.9, -0.1), new THREE.Vector3(0.78, -0.72, 0.18), new THREE.Vector3(1.6, -0.54, -0.3)];
	const colors = [0x20b9ec, 0x29dca9, 0x20b9ec, 0x9c68eb, 0x9c68eb];
	points.forEach((point, index) => createNode(graph, root, point, colors[index], index === 1 ? 0.15 : 0.1));
	addPath(graph, root, [points[0], points[1], points[2]], 0x25bce9, 0.63, true);
	addPath(graph, root, [points[1], new THREE.Vector3(0.35, 0.0, 0.14), points[3], points[4]], 0x9c68eb, 0.58, true);
	addTextSprite(graph, root, 'TOPOLOGY / CONTROL PLANE', 0x9c68eb, 1.75, new THREE.Vector3(-1.0, 1.2, 0.04));
	addTextSprite(graph, root, 'TOPOLOGY NODE 02', 0xd8f2f1, 1.3, new THREE.Vector3(1.08, -0.98, 0.04));
	graph.userData.animations.push((time) => {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		root.rotation.y = Math.sin(time * 0.07) * 0.035 * motion;
		root.rotation.x = Math.sin(time * 0.06) * 0.018 * motion;
	});
}

function addDataStreaks(graph, parent) {
	const random = mulberry32(808);
	const vertices = [];
	for (let i = 0; i < 26; i += 1) {
		const x = (random() - 0.5) * 7;
		const z = -2.4 - random() * 4.5;
		const y = -1.45 + random() * 2.9;
		const length = 0.04 + random() * 0.42;
		vertices.push(x, y, z, x, y + length, z);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	parent.add(new THREE.LineSegments(geometry, lineMaterial(graph, 0x4ddfd0, 0.18)));
}

function addVerificationSeal(graph, parent) {
	const seal = new THREE.Group();
	seal.position.set(0, 0.05, 0.98);
	const outer = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.018, 8, 64), lineMaterial(graph, 0x40d9cd, 0.64));
	const inner = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.01, 8, 64), lineMaterial(graph, 0x9c68eb, 0.44));
	seal.add(outer, inner);
	const checkGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.23, -0.01, 0.02), new THREE.Vector3(-0.06, -0.19, 0.02), new THREE.Vector3(-0.06, -0.19, 0.02), new THREE.Vector3(0.29, 0.22, 0.02)]);
	seal.add(new THREE.LineSegments(checkGeometry, lineMaterial(graph, 0x38f0b2, 0.95)));
	addGlowSprite(graph, seal, 0x38f0b2, 0.9, 0.26);
	parent.add(seal);
	graph.userData.animations.push((time) => {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		outer.rotation.z = time * 0.028 * motion;
		inner.rotation.z = -time * 0.04 * motion;
	});
}

function buildVault(graph, small) {
	addPerspectiveGrid(graph, 0.1, 0x0b6680);
	addDataStreaks(graph, graph);
	const root = new THREE.Group();
	root.position.set(0.32, 0.02, -1.5);
	root.scale.setScalar(small ? 0.72 : 0.86);
	graph.add(root);
	addWireCube(graph, root, { position: new THREE.Vector3(0, 0.16, 0), size: 1.75, color: 0x24ced2, innerColor: 0x3ce6b2, opacity: 0.44 });
	addWireCube(graph, root, { position: new THREE.Vector3(0.04, 0.18, 0.08), size: 1.22, color: 0x3ce6b2, innerColor: 0x9c68eb, opacity: 0.3, nested: false });
	addVerificationSeal(graph, root);
	addTextSprite(graph, root, 'SECURE ARCHIVE / ONLINE', 0x9c68eb, 1.65, new THREE.Vector3(-1.05, 1.25, 0.04));
	addTextSprite(graph, root, 'TRUST INDEX / 05', 0xd8f2f1, 1.25, new THREE.Vector3(1.05, -1.22, 0.04));
	const base = new THREE.Group();
	base.position.y = -0.84;
	for (const [radius, color, opacity] of [[0.65, 0x29e1b0, 0.44], [0.92, 0x25c5e8, 0.34], [1.2, 0x9c68eb, 0.25]]) {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.014, 8, 80), lineMaterial(graph, color, opacity));
		ring.rotation.x = Math.PI / 2;
		base.add(ring);
	}
	root.add(base);
	graph.userData.animations.push((time) => {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		base.rotation.y = time * 0.025 * motion;
		root.rotation.y = Math.sin(time * 0.05) * 0.04 * motion;
	});
}

function buildLab(graph, small) {
	addPerspectiveGrid(graph, 0.2, 0x096b87);
	addNetworkLandscape(graph, 'lab', 0.08);
	const root = new THREE.Group();
	root.position.set(0.25, -0.05, -1.5);
	root.scale.setScalar(small ? 0.7 : 0.84);
	graph.add(root);
	const platform = new THREE.Group();
	platform.position.y = -1.02;
	platform.add(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.42, 0.06, 64), registerMaterial(graph, new THREE.MeshBasicMaterial({ color: 0x093b4d, transparent: true, opacity: 0.36, depthWrite: false, toneMapped: false }))));
	for (const [radius, color, opacity] of [[0.48, 0x28e6b1, 0.68], [0.8, 0x29caed, 0.6], [1.08, 0x9c68eb, 0.42], [1.32, 0x28d4cf, 0.25]]) {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 8, 96), lineMaterial(graph, color, opacity));
		ring.rotation.x = Math.PI / 2;
		platform.add(ring);
	}
	root.add(platform);
	addWireCube(graph, root, { position: new THREE.Vector3(0, 0.18, 0), size: 1.45, color: 0x28d4cf, innerColor: 0x9c68eb, core: 0x38f0b2, opacity: 0.5, rotation: { x: 0.14, y: 0.22, z: -0.08 } });
	addWireCube(graph, root, { position: new THREE.Vector3(0.02, 0.2, 0.08), size: 0.78, color: 0x25b9ed, innerColor: 0x28e6b1, opacity: 0.32, nested: false });
	addTextSprite(graph, root, 'EXPERIMENT PLATFORM / LIVE', 0x25c9eb, 1.8, new THREE.Vector3(-1.2, 1.25, 0.04));
	addTextSprite(graph, root, 'BUILD / PLAY / OBSERVE', 0xd8f2f1, 1.5, new THREE.Vector3(1.0, -1.22, 0.04));
	const points = [new THREE.Vector3(-1.32, 0.56, -0.1), new THREE.Vector3(1.3, 0.72, -0.2), new THREE.Vector3(-0.95, -0.18, 0.14), new THREE.Vector3(1.08, -0.46, 0.08)];
	points.forEach((point, index) => createNode(graph, root, point, index % 2 ? 0x9c68eb : 0x29d8b4, 0.105));
	addPath(graph, root, [points[0], new THREE.Vector3(-0.35, 0.35, 0.1), points[1]], 0x29caed, 0.48, true);
	addPath(graph, root, [points[2], new THREE.Vector3(0.0, -0.1, 0.2), points[3]], 0x9c68eb, 0.45, false);
	graph.userData.animations.push((time) => {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		platform.rotation.y = time * 0.035 * motion;
		root.rotation.y = Math.sin(time * 0.06) * 0.05 * motion;
		root.position.y = -0.05 + Math.sin(time * 0.2) * 0.028 * motion;
	});
}

function createSceneGraph(kind, small) {
	const graph = new THREE.Group();
	graph.userData.materials = [];
	graph.userData.particleMaterials = [];
	graph.userData.animations = [];
	graph.userData.field = new GalaxyField(graph, kind, small);
	if (kind === 'hub') buildHub(graph, small);
	if (kind === 'career') buildCareer(graph, small);
	if (kind === 'projects') buildProjects(graph, small);
	if (kind === 'vault') buildVault(graph, small);
	if (kind === 'lab') buildLab(graph, small);
	return graph;
}

function disposeScene(graph, renderer) {
	if (!graph) return;
	graph.traverse((object) => {
		if (object.geometry) object.geometry.dispose();
		if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
	});
	if (renderer) renderer.dispose();
}

function mountScene(canvas, kind) {
	if (!canvas || canvas.dataset.sceneMounted === 'true') return;
	const frame = canvas.closest('.scene-frame');
	const small = window.innerWidth < 760;
	const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.6));
	renderer.setClearColor(0x000000, 0);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.18;
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(small ? 39 : 35, 1, 0.1, 40);
	camera.position.set(0, 0.06, kind === 'hub' ? 6.8 : 6.05);
	const target = new THREE.Vector3(0, 0, -1.85);
	const graph = createSceneGraph(kind, small);
	scene.add(graph);
	const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
	let disposed = false;
	let frameHandle = 0;
	const start = performance.now();

	function resize() {
		const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 600);
		const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 330);
		const pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.6);
		renderer.setPixelRatio(pixelRatio);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		graph.userData.particleMaterials.forEach((material) => { material.uniforms.uPixelRatio.value = pixelRatio; });
	}

	function onPointerMove(event) {
		const rect = canvas.getBoundingClientRect();
		pointer.tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
		pointer.ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
	}

	function cleanup() {
		if (disposed) return;
		disposed = true;
		cancelAnimationFrame(frameHandle);
		window.removeEventListener('resize', resize);
		canvas.removeEventListener('pointermove', onPointerMove);
		disposeScene(graph, renderer);
		scenes.delete(cleanup);
	}

	function render(now) {
		if (disposed) return;
		frameHandle = requestAnimationFrame(render);
		const time = (now - start) * 0.001;
		pointer.x += (pointer.tx - pointer.x) * 0.04;
		pointer.y += (pointer.ty - pointer.y) * 0.04;
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		camera.position.x += (pointer.x * 0.24 * motion - camera.position.x) * 0.018;
		camera.position.y += (-pointer.y * 0.12 * motion + 0.06 - camera.position.y) * 0.018;
		camera.lookAt(target);
		graph.userData.field.update(time, pointer);
		graph.userData.animations.forEach((animate) => animate(time));
		renderer.render(scene, camera);
	}

	canvas.dataset.sceneMounted = 'true';
	canvas.dataset.sceneEngine = 'galaxy-field-webgl';
	window.addEventListener('resize', resize, { passive: true });
	canvas.addEventListener('pointermove', onPointerMove, { passive: true });
	window.addEventListener('pagehide', cleanup, { once: true });
	scenes.add(cleanup);
	resize();
	requestAnimationFrame(render);
	if (frame) frame.dataset.sceneReady = 'true';
}

function initScenes() {
	document.querySelectorAll('canvas[data-three-scene]').forEach((canvas) => {
		try { mountScene(canvas, canvas.dataset.threeScene || 'hub'); }
		catch (error) { console.error('[scene] failed to mount', canvas.dataset.threeScene, error); canvas.dataset.sceneMounted = 'error'; }
	});
}

window.addEventListener('beforeunload', () => scenes.forEach((cleanup) => cleanup()), { once: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initScenes, { once: true });
else initScenes();
