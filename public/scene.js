import * as THREE from './vendor/three.module.js';

/* Shared layered WebGL scene engine. The galaxy distribution adapts the useful
 * ideas from dgreenheck/webgpu-galaxy to the site's vendored WebGL build. */
const TAU = Math.PI * 2;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const scenes = new Set();

const SCENE_CONFIG = {
	hub: { seed: 41, radius: 9.6, thickness: 3.2, arms: 3, tightness: 1.72, armWidth: 2.25, accent: 0x20e6a0, drift: 0.006, density: 1.5 },
	career: { seed: 73, radius: 8.5, thickness: 2.2, arms: 3, tightness: 1.34, armWidth: 1.75, accent: 0x24dca0, drift: 0.003, density: 0.92 },
	projects: { seed: 97, radius: 9.0, thickness: 2.5, arms: 4, tightness: 1.12, armWidth: 2.1, accent: 0x21b9ed, drift: 0.004, density: 0.88 },
	vault: { seed: 121, radius: 8.6, thickness: 2.6, arms: 4, tightness: 1.2, armWidth: 1.9, accent: 0x23d9ad, drift: 0.003, density: 0.82 },
	lab: { seed: 163, radius: 9.2, thickness: 2.7, arms: 5, tightness: 1.04, armWidth: 2.2, accent: 0x26d6cf, drift: 0.005, density: 0.9 },
};

const PALETTE = [
	new THREE.Color(0x8ccde5), new THREE.Color(0x28bde8), new THREE.Color(0x29dda6),
	new THREE.Color(0x9f70ef), new THREE.Color(0xd8f2f1), new THREE.Color(0x63f2c5),
];

const QUALITY_PRESETS = {
	high: { name: 'high', deep: 30000, mid: 12500, bright: 900, dust: 1450, dpr: 1.7, pointScale: 1, stride: 1 },
	medium: { name: 'medium', deep: 18000, mid: 7600, bright: 560, dust: 900, dpr: 1.35, pointScale: 0.92, stride: 1 },
	low: { name: 'low', deep: 9000, mid: 3800, bright: 280, dust: 420, dpr: 1.1, pointScale: 0.84, stride: 2 },
};

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

function selectQuality(kind) {
	const mobile = window.innerWidth < 760;
	const cores = navigator.hardwareConcurrency || 4;
	const dpr = window.devicePixelRatio || 1;
	if (reducedMotionQuery.matches) return QUALITY_PRESETS.low;
	if (mobile) return QUALITY_PRESETS.medium;
	if (cores <= 4 || dpr >= 2) return QUALITY_PRESETS.medium;
	return kind === 'hub' ? QUALITY_PRESETS.high : QUALITY_PRESETS.medium;
}

function makeRadialTexture(options = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = options.size || 128;
	const ctx = canvas.getContext('2d');
	const size = canvas.width;
	const color = options.color || '255,255,255';
	const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	gradient.addColorStop(0, `rgba(${color},1)`);
	gradient.addColorStop(0.08, `rgba(${color},.95)`);
	gradient.addColorStop(0.24, `rgba(${color},.44)`);
	gradient.addColorStop(0.5, `rgba(${color},.1)`);
	gradient.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);
	return new THREE.CanvasTexture(canvas);
}

let glowTexture;
function getGlowTexture() {
	if (!glowTexture) glowTexture = makeRadialTexture({ color: '170,255,230', size: 160 });
	return glowTexture;
}

let dustTexture;
function getDustTexture() {
	if (dustTexture) return dustTexture;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 256;
	const ctx = canvas.getContext('2d');
	const random = mulberry32(4096);
	const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
	gradient.addColorStop(0, 'rgba(170,255,230,.16)');
	gradient.addColorStop(0.32, 'rgba(50,205,220,.08)');
	gradient.addColorStop(0.7, 'rgba(65,110,180,.035)');
	gradient.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 256, 256);
	for (let i = 0; i < 140; i += 1) {
		const x = random() * 256;
		const y = random() * 256;
		const r = 2 + random() * 18;
		ctx.fillStyle = `rgba(${random() > 0.55 ? '35,220,175' : '58,130,205'},${0.008 + random() * 0.022})`;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, TAU);
		ctx.fill();
	}
	dustTexture = new THREE.CanvasTexture(canvas);
	return dustTexture;
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
		ctx.fillText(text, 8, 53);
		texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		textTextures.set(key, texture);
	}
	const material = registerMaterial(graph, new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.82, depthTest: false, depthWrite: false, toneMapped: false }));
	const sprite = new THREE.Sprite(material);
	sprite.scale.set(width, width * 0.125, 1);
	sprite.position.copy(position);
	sprite.renderOrder = 8;
	parent.add(sprite);
	return sprite;
}

function lineMaterial(graph, color, opacity = 0.45, dashed = false) {
	const Material = dashed ? THREE.LineDashedMaterial : THREE.LineBasicMaterial;
	return registerMaterial(graph, new Material({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, ...(dashed ? { dashSize: 0.08, gapSize: 0.08 } : {}) }));
}

function makeParticleMaterial(graph, options = {}) {
	const material = new THREE.ShaderMaterial({
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
		uniforms: {
			uTime: { value: 0 }, uOpacity: { value: options.opacity ?? 1 }, uPixelRatio: { value: options.pixelRatio ?? 1 },
			uPointScale: { value: options.pointScale ?? 1 }, uMaxSize: { value: options.maxSize ?? 6 },
			uSpeed: { value: options.speed ?? 0.004 }, uTwinkle: { value: options.twinkle ?? 0.25 },
		},
		vertexShader: `
			attribute float aSize; attribute float aSeed; varying vec3 vColor; varying float vSeed; varying float vDepth;
			uniform float uTime; uniform float uPixelRatio; uniform float uPointScale; uniform float uMaxSize; uniform float uSpeed;
			void main(){ vec3 p=position; float phase=uTime*uSpeed*(.7+aSeed*1.5)+aSeed*31.4; p.x+=sin(phase)*.0025; p.y+=cos(phase*.73)*.0025; vec4 mv=modelViewMatrix*vec4(p,1.0); vDepth=clamp((-mv.z-3.0)/26.0,0.0,1.0); float perspective=1.0+9.0/max(5.0,-mv.z); gl_PointSize=clamp(aSize*uPointScale*uPixelRatio*perspective,.45,uMaxSize); vColor=color; vSeed=aSeed; gl_Position=projectionMatrix*mv; }
		`,
		fragmentShader: `
			uniform float uTime; uniform float uOpacity; uniform float uTwinkle; varying vec3 vColor; varying float vSeed; varying float vDepth;
			void main(){ vec2 point=gl_PointCoord*2.0-1.0; float d=length(point); if(d>1.0) discard; float halo=pow(max(0.0,1.0-d),2.5); float core=smoothstep(.52,.03,d); float twinkle=1.0+sin(uTime*(.45+vSeed*2.2)+vSeed*20.0)*uTwinkle; float alpha=(core*.82+halo*.42)*uOpacity*twinkle; vec3 outColor=vColor*(.52+core*1.6+halo*.52); gl_FragColor=vec4(outColor,alpha); }
		`,
		toneMapped: false,
	});
	graph.userData.materials.push(material);
	graph.userData.particleMaterials.push(material);
	return material;
}

function addParticles(graph, parent, data, options = {}) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
	geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(data.sizes, 1));
	geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(data.seeds, 1));
	const points = new THREE.Points(geometry, makeParticleMaterial(graph, options));
	points.frustumCulled = false;
	points.renderOrder = options.renderOrder ?? 1;
	parent.add(points);
	return points;
}

function pickStarColor(random, intensity = 1) {
	return PALETTE[Math.floor(random() * PALETTE.length)].clone().multiplyScalar((0.68 + random() * 0.42) * intensity);
}

function makeDeepStars(random, count, hero = false) {
	const data = { positions: [], colors: [], sizes: [], seeds: [] };
	for (let i = 0; i < count; i += 1) {
		const depth = random();
		const x = normalSample(random) * (hero ? 4.8 : 15.5 * (0.58 + depth * 0.42));
		const y = normalSample(random) * (hero ? 2.8 : 7.0 * (0.5 + depth * 0.5));
		const z = -3.8 - depth * 24.0 - random() * 3.2;
		data.positions.push(x, y, z);
		data.colors.push(...Object.values(pickStarColor(random, hero ? 0.82 + random() * 0.42 : 0.24 + Math.pow(random(), 3.2) * 0.58)));
		data.sizes.push(hero ? 0.75 + Math.pow(random(), 6) * 3.6 : 0.36 + Math.pow(random(), 5.2) * 1.55);
		data.seeds.push(random());
	}
	return data;
}

function makeSpiralStars(random, count, config, bright = false) {
	const data = { positions: [], colors: [], sizes: [], seeds: [] };
	for (let i = 0; i < count; i += 1) {
		const seed = random();
		const radius = Math.pow(seed, 0.56) * config.radius;
		const normalizedRadius = radius / config.radius;
		const armIndex = Math.floor(random() * config.arms);
		const angle = armIndex * TAU / config.arms + normalizedRadius * config.tightness * TAU + normalSample(random) * (bright ? 0.26 : 0.68);
		const offsetRadius = Math.max(0.18, radius + normalSample(random) * (bright ? 0.07 : config.armWidth * (0.2 + normalizedRadius * 0.8)));
		const thickness = config.thickness * (1.22 - normalizedRadius * 0.82);
		data.positions.push(
			Math.cos(angle) * offsetRadius + normalSample(random) * (bright ? 0.05 : 0.22),
			Math.sin(angle) * offsetRadius * 0.47 + normalSample(random) * thickness * (bright ? 0.08 : 0.27),
			-3.8 - offsetRadius * 0.43 + normalSample(random) * (bright ? 0.06 : 0.38),
		);
		data.colors.push(...Object.values(pickStarColor(random, bright ? 0.72 + Math.pow(random(), 2.4) * 0.6 : 0.3 + Math.pow(random(), 2.2) * 0.72)));
		data.sizes.push(bright ? 1.2 + Math.pow(random(), 5.8) * 4.7 : 0.48 + Math.pow(random(), 4.3) * 2.25);
		data.seeds.push(random());
	}
	return data;
}

function makeDust(random, count, config) {
	const data = { positions: [], scales: [], colors: [] };
	for (let i = 0; i < count; i += 1) {
		const radius = Math.pow(random(), 0.64) * config.radius * 1.06;
		const angle = random() * TAU + radius * config.tightness * 0.36;
		data.positions.push(new THREE.Vector3(Math.cos(angle) * radius * 0.92 + normalSample(random) * 0.72, Math.sin(angle) * radius * 0.34 + normalSample(random) * config.thickness * 0.22, -5.1 - radius * 0.35 - random() * 7));
		data.scales.push(1 + random() * 2.6, 0.28 + random() * 0.82);
		data.colors.push(random() > 0.54 ? new THREE.Color(0x23cbb7) : (random() > 0.5 ? new THREE.Color(0x2469bb) : new THREE.Color(0x7437aa)));
	}
	return data;
}

function addDustClouds(graph, parent, data, opacity = 0.075) {
	data.positions.forEach((position, index) => {
		const material = registerMaterial(graph, new THREE.SpriteMaterial({ map: getDustTexture(), color: data.colors[index], transparent: true, opacity: opacity * (0.48 + data.scales[index * 2] * 0.13), depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
		const sprite = new THREE.Sprite(material);
		sprite.position.copy(position);
		sprite.scale.set(data.scales[index * 2], data.scales[index * 2] * data.scales[index * 2 + 1], 1);
		sprite.renderOrder = 0;
		parent.add(sprite);
	});
}

function addNebulaVeils(graph, parent, kind) {
	const colors = kind === 'projects' ? [new THREE.Color(0x0c78af), new THREE.Color(0x52299b)] : [new THREE.Color(0x096b6f), new THREE.Color(0x0f5588), new THREE.Color(0x4a267d)];
	const positions = kind === 'hub' ? [[-4.8, 1.2, -11], [4.5, -0.7, -13], [0.2, 2.8, -17], [-1.5, -2.8, -15]] : [[-4.2, 1.5, -10], [3.7, -0.9, -12], [0.6, 2.4, -16]];
	positions.forEach((position, index) => {
		const material = registerMaterial(graph, new THREE.SpriteMaterial({ map: getDustTexture(), color: colors[index % colors.length], transparent: true, opacity: kind === 'hub' ? 0.09 : 0.055, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
		const sprite = new THREE.Sprite(material);
		sprite.position.set(...position);
		const scale = kind === 'hub' ? 6.4 + index * 0.9 : 5.6 + index * 0.7;
		sprite.scale.set(scale, scale * 0.48, 1);
		sprite.renderOrder = 0;
		parent.add(sprite);
	});
}

class GalaxyField {
	constructor(graph, kind, quality) {
		this.graph = graph;
		this.kind = kind;
		this.config = SCENE_CONFIG[kind];
		this.quality = quality;
		this.group = new THREE.Group();
		this.group.name = 'layered-cosmic-environment';
		graph.add(this.group);
		this.random = mulberry32(this.config.seed);
		this.layers = [];
		this.build();
	}

	build() {
		const multiplier = this.config.density;
		const deepCount = Math.floor(this.quality.deep * multiplier);
		const midCount = Math.floor(this.quality.mid * multiplier);
		const brightCount = Math.floor(this.quality.bright * (this.kind === 'hub' ? 1.15 : 0.86));
		const dustCount = Math.floor(this.quality.dust * multiplier);
		this.layers.push(addParticles(this.graph, this.group, makeDeepStars(this.random, deepCount), { opacity: this.kind === 'hub' ? 0.9 : 0.62, pixelRatio: 1, pointScale: this.quality.pointScale, maxSize: 2.8, speed: 0.11, twinkle: 0.22, renderOrder: 1 }));
		this.layers.push(addParticles(this.graph, this.group, makeSpiralStars(this.random, midCount, this.config), { opacity: this.kind === 'hub' ? 0.86 : 0.56, pixelRatio: 1, pointScale: this.quality.pointScale, maxSize: 4.4, speed: 0.16, twinkle: 0.3, renderOrder: 2 }));
		this.layers.push(addParticles(this.graph, this.group, makeSpiralStars(this.random, brightCount, this.config, true), { opacity: this.kind === 'hub' ? 1 : 0.78, pixelRatio: 1, pointScale: this.quality.pointScale, maxSize: 8, speed: 0.22, twinkle: 0.48, renderOrder: 3 }));
		addDustClouds(this.graph, this.group, makeDust(this.random, dustCount, this.config), this.kind === 'hub' ? 0.08 : 0.052);
		addNebulaVeils(this.graph, this.group, this.kind);
	}

	update(time, pointer) {
		const motion = reducedMotionQuery.matches ? 0.12 : 1;
		this.group.rotation.y = Math.sin(time * this.config.drift * 7) * 0.018 * motion + pointer.x * 0.006;
		this.group.rotation.x = Math.cos(time * this.config.drift * 5) * 0.008 * motion - pointer.y * 0.004;
		this.layers.forEach((layer, index) => {
			layer.material.uniforms.uTime.value = time * motion;
			layer.position.x = Math.sin(time * (0.007 + index * 0.002)) * (index === 0 ? 0.012 : 0.028) * motion;
			layer.position.y = Math.cos(time * (0.009 + index * 0.002)) * (index === 0 ? 0.008 : 0.018) * motion;
		});
	}
}

function addPerspectiveGrid(graph, opacity = 0.16, color = 0x08708d) {
	const vertices = [];
	for (let i = -9; i <= 9; i += 1) { const x = i * 0.55; vertices.push(x, -1.48, -1, x * 3.2, -1.48, -12.5); }
	for (let i = 0; i <= 8; i += 1) { const z = -1 - i * i * 0.18; const half = 1.25 + i * 0.72; vertices.push(-half, -1.48, z, half, -1.48, z); }
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	const grid = new THREE.LineSegments(geometry, lineMaterial(graph, color, opacity));
	grid.name = 'lower-perspective-grid';
	grid.renderOrder = 0;
	graph.add(grid);
}

function addNetworkLandscape(graph, kind, opacity = 0.1) {
	const random = mulberry32(SCENE_CONFIG[kind].seed + 900);
	const vertices = [];
	for (let i = 0; i < 42; i += 1) {
		const x = (random() - 0.5) * 8.4, y = -1.02 + random() * 0.62, z = -2.1 - random() * 5.2;
		vertices.push(x, y, z, x + (random() - 0.5) * 1.4, y + (random() - 0.5) * 0.35, z - 0.3 - random() * 1.2);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	graph.add(new THREE.LineSegments(geometry, lineMaterial(graph, kind === 'career' ? 0x1f9eb7 : 0x21799b, opacity)));
}

function addGlowSprite(graph, parent, color, size, opacity = 0.55) {
	const sprite = new THREE.Sprite(registerMaterial(graph, new THREE.SpriteMaterial({ map: getGlowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
	sprite.scale.setScalar(size);
	sprite.renderOrder = 4;
	parent.add(sprite);
	return sprite;
}

function createNode(graph, parent, position, color, size = 0.12, label = '') {
	const node = new THREE.Group();
	node.position.copy(position);
	node.name = label || 'semantic-node';
	const core = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.72, 2), registerMaterial(graph, new THREE.MeshBasicMaterial({ color, toneMapped: false })));
	const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 1.06, Math.max(0.008, size * 0.08), 6, 32), lineMaterial(graph, color, 0.72));
	ring.rotation.x = Math.PI / 2;
	node.add(core, ring);
	addGlowSprite(graph, node, color, size * 3.8, 0.23);
	if (label) addTextSprite(graph, node, label, color, Math.max(0.62, label.length * 0.06), new THREE.Vector3(0.14, 0.17, 0));
	parent.add(node);
	return node;
}

function addPath(graph, parent, points, color, opacity = 0.65, flow = false) {
	const curve = new THREE.CatmullRomCurve3(points);
	const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), lineMaterial(graph, color, opacity));
	line.renderOrder = 5;
	parent.add(line);
	if (flow) {
		const marker = createNode(graph, parent, points[0], color, 0.055);
		graph.userData.animations.push((time) => marker.position.copy(curve.getPointAt((time * 0.06) % 1)));
	}
	return line;
}

function addOrbit(graph, parent, radius, color, rotation, opacity = 0.46, eccentricity = 0.34) {
	const curve = new THREE.EllipseCurve(0, 0, radius, radius * eccentricity, 0, TAU, false, 0);
	const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(128).map((point) => new THREE.Vector3(point.x, point.y, 0)));
	const orbit = new THREE.Line(geometry, lineMaterial(graph, color, opacity));
	orbit.rotation.set(rotation?.x ?? 0, rotation?.y ?? 0, rotation?.z ?? 0);
	orbit.renderOrder = 5;
	parent.add(orbit);
	return orbit;
}

function planetMaterial(graph, color, deep) {
	return registerMaterial(graph, new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) } },
		vertexShader: 'varying vec3 vNormal; varying vec3 vWorld; varying vec3 vLocal; void main(){vNormal=normalize(normalMatrix*normal);vLocal=position;vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}',
		fragmentShader: `
			uniform float uTime; uniform vec3 uColor; uniform vec3 uDeep; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vLocal;
			float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
			float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
			float fbm(vec3 p){float v=0.,a=.55;for(int i=0;i<4;i++){v+=noise(p)*a;p*=2.03;a*=.5;}return v;}
			void main(){vec3 n=normalize(vLocal);float land=fbm(n*3.2+vec3(uTime*.018,0.,uTime*.011));float ridges=fbm(n*8.-vec3(0.,uTime*.025,0.));float light=max(dot(vNormal,normalize(vec3(-.48,.6,.86))),0.);float facing=max(dot(vNormal,normalize(cameraPosition-vWorld)),0.);float rim=pow(1.-facing,2.7);vec3 surface=mix(uDeep,uColor,smoothstep(.28,.73,land));surface+=uColor*smoothstep(.64,.9,ridges)*.2;gl_FragColor=vec4(surface*(.22+light*.92)+uColor*rim*.7,.96);}
		`,
		toneMapped: false,
	}));
}

function addPlanet(graph, parent, options = {}) {
	const radius = options.radius ?? 0.7;
	const planet = new THREE.Group();
	planet.position.copy(options.position ?? new THREE.Vector3());
	planet.name = options.name || 'planetary-identity-node';
	const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), planetMaterial(graph, options.color ?? 0x20e6a0, options.deep ?? 0x063c47));
	planet.add(body);
	planet.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.075, 48, 32), registerMaterial(graph, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(options.color ?? 0x20e6a0) } }, vertexShader: 'varying vec3 vNormal; void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'uniform vec3 uColor; varying vec3 vNormal; void main(){float rim=pow(1.-max(vNormal.z,0.),2.1);gl_FragColor=vec4(uColor,rim*.34);}', toneMapped: false }))));
	addGlowSprite(graph, planet, options.color ?? 0x20e6a0, radius * 2.85, 0.16);
	const shellRandom = mulberry32((options.seed ?? 13) + 500);
	const shell = { positions: [], colors: [], sizes: [], seeds: [] };
	for (let i = 0; i < 340; i += 1) {
		const theta = TAU * shellRandom(), phi = Math.acos(2 * shellRandom() - 1), r = radius * (1.002 + shellRandom() * 0.025);
		shell.positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
		const c = new THREE.Color(options.color ?? 0x20e6a0).multiplyScalar(0.36 + shellRandom() * 0.72);
		shell.colors.push(c.r, c.g, c.b); shell.sizes.push(0.08 + Math.pow(shellRandom(), 3) * 0.52); shell.seeds.push(shellRandom());
	}
	addParticles(graph, planet, shell, { opacity: 0.66, speed: 0.03, pointScale: 1, maxSize: 2.8, twinkle: 0.3, renderOrder: 4 });
	if (options.letter) {
		const label = new THREE.Sprite(registerMaterial(graph, new THREE.SpriteMaterial({ map: getLetterTexture(options.letter, '#e8fff9'), transparent: true, depthTest: false, depthWrite: false, toneMapped: false })));
		label.scale.setScalar(radius * 0.66); label.position.z = radius * 1.01; label.renderOrder = 9; planet.add(label);
	}
	parent.add(planet);
	graph.userData.animations.push((time) => { const motion = reducedMotionQuery.matches ? 0.12 : 1; planet.rotation.y = time * 0.018 * motion; planet.rotation.x = Math.sin(time * 0.07) * 0.06 * motion; if (body.material.uniforms?.uTime) body.material.uniforms.uTime.value = time * motion; });
	return planet;
}

function addTopologyBox(graph, parent, options = {}) {
	const group = new THREE.Group();
	group.position.copy(options.position ?? new THREE.Vector3());
	group.rotation.set(options.rotation?.x ?? 0, options.rotation?.y ?? 0, options.rotation?.z ?? 0);
	const size = options.size ?? 1.7, color = options.color ?? 0x21b9ed;
	const shellGeometry = new THREE.BoxGeometry(size, size, size);
	group.add(new THREE.Mesh(shellGeometry, registerMaterial(graph, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.025, depthWrite: false, toneMapped: false }))));
	group.add(new THREE.LineSegments(new THREE.EdgesGeometry(shellGeometry), lineMaterial(graph, color, options.opacity ?? 0.64)));
	const innerGeometry = new THREE.BoxGeometry(size * 0.58, size * 0.58, size * 0.58);
	const inner = new THREE.LineSegments(new THREE.EdgesGeometry(innerGeometry), lineMaterial(graph, options.innerColor ?? 0x9c68eb, 0.58));
	inner.rotation.set(0.18, -0.28, 0.24); inner.position.set(0.05, -0.02, 0.12); group.add(inner);
	if (options.core) { group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.12, 2), registerMaterial(graph, new THREE.MeshBasicMaterial({ color: options.core, toneMapped: false })))); addGlowSprite(graph, group, options.core, size * 0.68, 0.28); }
	parent.add(group);
	graph.userData.animations.push((time) => { const motion = reducedMotionQuery.matches ? 0.12 : 1; group.rotation.y += 0.00035 * motion; group.position.y = (options.position?.y ?? 0) + Math.sin(time * 0.21) * 0.035 * motion; });
	return group;
}

function addDataStreaks(graph, parent) {
	const random = mulberry32(808), vertices = [];
	for (let i = 0; i < 32; i += 1) { const x = (random() - 0.5) * 7, z = -2.4 - random() * 9, y = -1.45 + random() * 2.9, length = 0.04 + random() * 0.42; vertices.push(x, y, z, x, y + length, z); }
	const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	parent.add(new THREE.LineSegments(geometry, lineMaterial(graph, 0x4ddfd0, 0.18)));
}

function addVerificationSeal(graph, parent) {
	const seal = new THREE.Group(); seal.position.set(0, 0.05, 0.98);
	const outer = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.018, 8, 64), lineMaterial(graph, 0x40d9cd, 0.64));
	const inner = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.01, 8, 64), lineMaterial(graph, 0x9c68eb, 0.44));
	seal.add(outer, inner);
	const checkGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.23, -0.01, 0.02), new THREE.Vector3(-0.06, -0.19, 0.02), new THREE.Vector3(-0.06, -0.19, 0.02), new THREE.Vector3(0.29, 0.22, 0.02)]);
	seal.add(new THREE.LineSegments(checkGeometry, lineMaterial(graph, 0x38f0b2, 0.95))); addGlowSprite(graph, seal, 0x38f0b2, 0.9, 0.22); parent.add(seal);
	graph.userData.animations.push((time) => { const motion = reducedMotionQuery.matches ? 0.12 : 1; outer.rotation.z = time * 0.028 * motion; inner.rotation.z = -time * 0.04 * motion; });
}

function buildHub(graph, small) {
	addPerspectiveGrid(graph, 0.17);
	const root = new THREE.Group(); root.position.set(0.05, 0.12, -1.5); root.scale.setScalar(small ? 0.82 : 1.28); graph.add(root);
	addPlanet(graph, root, { radius: 0.82, color: 0x20e6a0, deep: 0x07565a, letter: 'W', seed: 41 });
	[
		{ radius: 1.04, color: 0x27cce8, rotation: { x: 0.1, y: 0.12, z: 0.12 }, node: 0x27cce8 },
		{ radius: 1.3, color: 0x45e8b0, rotation: { x: -0.14, y: 0.18, z: -0.32 }, node: 0x42e8b0 },
		{ radius: 1.58, color: 0x9c68eb, rotation: { x: 0.22, y: -0.1, z: 0.46 }, node: 0x9c68eb },
		{ radius: 1.84, color: 0x74ddeb, rotation: { x: -0.28, y: 0.25, z: -0.18 }, node: 0x74ddeb },
	].forEach((spec, index) => { const orbit = addOrbit(graph, root, spec.radius, spec.color, spec.rotation, 0.46, 0.34 + index * 0.03); const angle = [0.5, 2.4, 4.3, 5.45][index]; const node = createNode(graph, orbit, new THREE.Vector3(Math.cos(angle) * spec.radius, Math.sin(angle) * spec.radius * 0.34, 0), spec.node, index === 0 ? 0.18 : 0.12); if (index === 0) node.position.z = 0.08; });
	addTextSprite(graph, root, 'SYSTEMS', 0x25c9eb, 0.9, new THREE.Vector3(-1.48, -0.92, 0.04)); addTextSprite(graph, root, 'RELIABILITY', 0x36e5b2, 1.1, new THREE.Vector3(0.68, 1.1, 0.04)); addTextSprite(graph, root, 'INNOVATION', 0x9c68eb, 1.05, new THREE.Vector3(1.42, -0.46, 0.04));
	graph.userData.animations.push((time) => { const motion = reducedMotionQuery.matches ? 0.12 : 1; root.rotation.y = Math.sin(time * 0.09) * 0.08 * motion; root.rotation.x = Math.sin(time * 0.06) * 0.025 * motion; });
}

function buildCareer(graph, small) {
	addPerspectiveGrid(graph, 0.12); addNetworkLandscape(graph, 'career', 0.12);
	const root = new THREE.Group(); root.position.set(0.72, 0.48, -1.45); root.scale.setScalar(small ? 0.78 : 1.08); graph.add(root);
	const center = addPlanet(graph, root, { radius: 0.46, color: 0x21c6e7, deep: 0x082b4c, letter: 'W', seed: 73 });
	const nodes = [new THREE.Vector3(-1.1, -0.64, 0.04), new THREE.Vector3(-0.12, 0.18, 0.12), new THREE.Vector3(0.84, 0.76, 0), new THREE.Vector3(1.25, -0.42, 0.12), new THREE.Vector3(1.56, 0.72, -0.02)];
	const nodeColors = [0x22dca1, 0x26c7ea, 0x9c68eb, 0x23dba0, 0xe1f5f2];
	nodes.forEach((position, index) => createNode(graph, root, position, nodeColors[index], index === 1 ? 0.16 : 0.11));
	addPath(graph, root, [nodes[0], nodes[1], new THREE.Vector3(0.25, 0.05, 0.1)], 0x24dca0, 0.68, true); addPath(graph, root, [new THREE.Vector3(0.25, 0.05, 0.1), nodes[2], nodes[4]], 0x24dca0, 0.58); addPath(graph, root, [new THREE.Vector3(0.08, 0.02, 0.16), nodes[3]], 0x9c68eb, 0.5); addOrbit(graph, center, 0.68, 0x2ad8c0, { x: 0.22, y: -0.18, z: 0.1 }, 0.3, 0.42);
	addTextSprite(graph, root, 'SYSTEMS / 2021-2025', 0x25c9eb, 1.55, new THREE.Vector3(-0.62, -1.05, 0.04)); addTextSprite(graph, root, 'RELIABILITY NODE', 0x35e5b1, 1.45, new THREE.Vector3(1.1, 1.22, 0.04)); addTextSprite(graph, root, 'LEARNING VECTOR', 0x9c68eb, 1.42, new THREE.Vector3(1.25, -0.78, 0.04));
	graph.userData.animations.push((time) => { const motion = reducedMotionQuery.matches ? 0.12 : 1; root.rotation.y = Math.sin(time * 0.05) * 0.045 * motion; root.position.y = 0.48 + Math.sin(time * 0.16) * 0.02 * motion; });
}

function buildProjects(graph, small) {
	addPerspectiveGrid(graph, 0.22, 0x076a90); addNetworkLandscape(graph, 'projects', 0.08);
	const root = new THREE.Group(); root.position.set(-0.24, 0.05, -1.55); root.scale.setScalar(small ? 0.8 : 1.1); graph.add(root);
	addTopologyBox(graph, root, { position: new THREE.Vector3(-0.48, 0.28, 0), size: 1.72, color: 0x21b9ed, innerColor: 0x9c68eb, core: 0x25d9c5, rotation: { x: 0.18, y: -0.32, z: 0.05 }, opacity: 0.64 });
	const points = [new THREE.Vector3(-1.25, 0.78, 0.18), new THREE.Vector3(-0.05, 0.46, 0.1), new THREE.Vector3(1.08, 0.9, -0.1), new THREE.Vector3(0.78, -0.72, 0.18), new THREE.Vector3(1.6, -0.54, -0.3)];
	const colors = [0x20b9ec, 0x29dca9, 0x20b9ec, 0x9c68eb, 0x9c68eb]; points.forEach((point, index) => createNode(graph, root, point, colors[index], index === 1 ? 0.15 : 0.1));
	addPath(graph, root, [points[0], points[1], points[2]], 0x25bce9, 0.63, true); addPath(graph, root, [points[1], new THREE.Vector3(0.35, 0, 0.14), points[3], points[4]], 0x9c68eb, 0.58, true);
	addTextSprite(graph, root, 'TOPOLOGY / CONTROL PLANE', 0x9c68eb, 1.75, new THREE.Vector3(-1, 1.2, 0.04)); addTextSprite(graph, root, 'TOPOLOGY NODE 02', 0xd8f2f1, 1.3, new THREE.Vector3(1.08, -0.98, 0.04));
	graph.userData.animations.push((time) => { const motion = reducedMotionQuery.matches ? 0.12 : 1; root.rotation.y = Math.sin(time * 0.07) * 0.035 * motion; root.rotation.x = Math.sin(time * 0.06) * 0.018 * motion; });
}

function buildVault(graph, small) {
	addPerspectiveGrid(graph, 0.1, 0x0b6680); addDataStreaks(graph, graph);
	const root = new THREE.Group(); root.position.set(0.32, 0.02, -1.5); root.scale.setScalar(small ? 0.8 : 1.12); graph.add(root);
	addTopologyBox(graph, root, { position: new THREE.Vector3(0, 0.16, 0), size: 1.78, color: 0x24ced2, innerColor: 0x3ce6b2, opacity: 0.44 }); addTopologyBox(graph, root, { position: new THREE.Vector3(0.04, 0.18, 0.08), size: 1.22, color: 0x3ce6b2, innerColor: 0x9c68eb, opacity: 0.3 }); addVerificationSeal(graph, root);
	addTextSprite(graph, root, 'SECURE ARCHIVE / ONLINE', 0x9c68eb, 1.65, new THREE.Vector3(-1.05, 1.25, 0.04)); addTextSprite(graph, root, 'TRUST INDEX / 05', 0xd8f2f1, 1.25, new THREE.Vector3(1.05, -1.22, 0.04));
	const base = new THREE.Group(); base.position.y = -0.84; [[0.65, 0x29e1b0, 0.44], [0.92, 0x25c5e8, 0.34], [1.2, 0x9c68eb, 0.25]].forEach(([radius, color, opacity]) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.014, 8, 80), lineMaterial(graph, color, opacity)); ring.rotation.x = Math.PI / 2; base.add(ring); }); root.add(base);
	graph.userData.animations.push((time) => { const motion = reducedMotionQuery.matches ? 0.12 : 1; base.rotation.y = time * 0.025 * motion; root.rotation.y = Math.sin(time * 0.05) * 0.04 * motion; });
}

function buildLab(graph, small) {
	addPerspectiveGrid(graph, 0.2, 0x096b87); addNetworkLandscape(graph, 'lab', 0.08);
	const root = new THREE.Group(); root.position.set(0.25, -0.05, -1.5); root.scale.setScalar(small ? 0.8 : 1.1); graph.add(root);
	const platform = new THREE.Group(); platform.position.y = -1.02; platform.add(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.42, 0.06, 64), registerMaterial(graph, new THREE.MeshBasicMaterial({ color: 0x093b4d, transparent: true, opacity: 0.36, depthWrite: false, toneMapped: false }))));
	[[0.48, 0x28e6b1, 0.68], [0.8, 0x29caed, 0.6], [1.08, 0x9c68eb, 0.42], [1.32, 0x28d4cf, 0.25]].forEach(([radius, color, opacity]) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 8, 96), lineMaterial(graph, color, opacity)); ring.rotation.x = Math.PI / 2; platform.add(ring); }); addGlowSprite(graph, platform, 0x22dcb5, 2.2, 0.06); root.add(platform);
	addTopologyBox(graph, root, { position: new THREE.Vector3(0, 0.18, 0), size: 1.45, color: 0x28d4cf, innerColor: 0x9c68eb, core: 0x38f0b2, opacity: 0.5, rotation: { x: 0.14, y: 0.22, z: -0.08 } }); addTopologyBox(graph, root, { position: new THREE.Vector3(0.02, 0.2, 0.08), size: 0.78, color: 0x25b9ed, innerColor: 0x28e6b1, opacity: 0.32 });
	addTextSprite(graph, root, 'EXPERIMENT PLATFORM / LIVE', 0x25c9eb, 1.8, new THREE.Vector3(-1.2, 1.25, 0.04)); addTextSprite(graph, root, 'BUILD / PLAY / OBSERVE', 0xd8f2f1, 1.5, new THREE.Vector3(1, -1.22, 0.04));
	const points = [new THREE.Vector3(-1.32, 0.56, -0.1), new THREE.Vector3(1.3, 0.72, -0.2), new THREE.Vector3(-0.95, -0.18, 0.14), new THREE.Vector3(1.08, -0.46, 0.08)]; points.forEach((point, index) => createNode(graph, root, point, index % 2 ? 0x9c68eb : 0x29d8b4, 0.105)); addPath(graph, root, [points[0], new THREE.Vector3(-0.35, 0.35, 0.1), points[1]], 0x29caed, 0.48, true); addPath(graph, root, [points[2], new THREE.Vector3(0, -0.1, 0.2), points[3]], 0x9c68eb, 0.45);
	graph.userData.animations.push((time) => { const motion = reducedMotionQuery.matches ? 0.12 : 1; platform.rotation.y = time * 0.035 * motion; root.rotation.y = Math.sin(time * 0.06) * 0.05 * motion; root.position.y = -0.05 + Math.sin(time * 0.2) * 0.028 * motion; });
}

function createSceneGraph(kind, small, quality) {
	const graph = new THREE.Group(); graph.userData.materials = []; graph.userData.particleMaterials = []; graph.userData.animations = []; graph.userData.field = new GalaxyField(graph, kind, quality);
	if (kind === 'hub') buildHub(graph, small); if (kind === 'career') buildCareer(graph, small); if (kind === 'projects') buildProjects(graph, small); if (kind === 'vault') buildVault(graph, small); if (kind === 'lab') buildLab(graph, small);
	return graph;
}

function disposeScene(graph, renderer) {
	if (!graph) return;
	graph.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose()); });
	if (renderer) renderer.dispose();
}

function mountScene(canvas, kind) {
	if (!canvas || canvas.dataset.sceneMounted === 'true') return;
	const frame = canvas.closest('.scene-frame'); const small = window.innerWidth < 760; const quality = selectQuality(kind);
	const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr)); renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = kind === 'hub' ? 1.24 : 1.12;
	const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(small ? 39 : 35, 1, 0.1, 50); camera.position.set(0, 0.06, kind === 'hub' ? 6.8 : 6.05); const target = new THREE.Vector3(0, 0, -1.85); const graph = createSceneGraph(kind, small, quality); scene.add(graph);
	const pointer = { x: 0, y: 0, tx: 0, ty: 0 }; let disposed = false; let frameHandle = 0; let frameNumber = 0; let lastNow = performance.now(); let frameEma = 16.7; let renderStride = quality.stride; const start = performance.now();
	function resize() { const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 600); const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 330); const pixelRatio = Math.min(window.devicePixelRatio || 1, quality.dpr); renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); graph.userData.particleMaterials.forEach((material) => { material.uniforms.uPixelRatio.value = pixelRatio; }); }
	function onPointerMove(event) { const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return; pointer.tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2; pointer.ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2; }
	function cleanup() { if (disposed) return; disposed = true; cancelAnimationFrame(frameHandle); window.removeEventListener('resize', resize); canvas.removeEventListener('pointermove', onPointerMove); disposeScene(graph, renderer); scenes.delete(cleanup); }
	function render(now) { if (disposed) return; frameHandle = requestAnimationFrame(render); const delta = Math.min(80, now - lastNow); lastNow = now; frameEma = frameEma * 0.94 + delta * 0.06; if (frameNumber % 90 === 0 && frameEma > 27 && renderStride === 1) renderStride = 2; if (frameNumber % 240 === 0 && frameEma < 20 && renderStride === 2 && quality.stride === 1) renderStride = 1; frameNumber += 1; if (renderStride === 2 && frameNumber % 2 === 0) return; const time = (now - start) * 0.001; pointer.x += (pointer.tx - pointer.x) * 0.04; pointer.y += (pointer.ty - pointer.y) * 0.04; const motion = reducedMotionQuery.matches ? 0.12 : 1; camera.position.x += (pointer.x * 0.24 * motion - camera.position.x) * 0.018; camera.position.y += (-pointer.y * 0.12 * motion + 0.06 - camera.position.y) * 0.018; camera.lookAt(target); graph.userData.field.update(time, pointer); graph.userData.animations.forEach((animate) => animate(time)); renderer.render(scene, camera); }
	canvas.dataset.sceneMounted = 'true'; canvas.dataset.sceneEngine = 'layered-galaxy-webgl'; canvas.dataset.sceneQuality = quality.name; window.addEventListener('resize', resize, { passive: true }); canvas.addEventListener('pointermove', onPointerMove, { passive: true }); window.addEventListener('pagehide', cleanup, { once: true }); scenes.add(cleanup); resize(); requestAnimationFrame(render); if (frame) frame.dataset.sceneReady = 'true';
}

function initScenes() {
	document.querySelectorAll('canvas[data-three-scene]').forEach((canvas) => { try { mountScene(canvas, canvas.dataset.threeScene || 'hub'); } catch (error) { console.error('[scene] failed to mount', canvas.dataset.threeScene, error); canvas.dataset.sceneMounted = 'error'; } });
}

window.addEventListener('beforeunload', () => scenes.forEach((cleanup) => cleanup()), { once: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initScenes, { once: true }); else initScenes();
