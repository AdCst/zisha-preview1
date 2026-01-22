import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

// DOM
const container = document.getElementById('viewer');

// 场景
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

// 相机
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);

// 渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// 灯光（对贴花很重要）
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

// 控制器
const controls = new OrbitControls(camera, renderer.domElement);

// 加载器
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

let currentModel = null;
let decalMesh = null;

// ===============================
// 加载壶模型
// ===============================
function loadModel(url) {
  loader.load(url, (gltf) => {
    if (currentModel) scene.remove(currentModel);
    if (decalMesh) scene.remove(decalMesh);

    const model = gltf.scene;

    // 居中模型
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    model.position.sub(center);
    scene.add(model);
    currentModel = model;

    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(0, 0, maxDim * 1.5);
    camera.lookAt(0, 0, 0);

    controls.target.set(0, 0, 0);
    controls.update();
  });
}

// ===============================
// ⭐ 固定位置贴图函数（核心）
// ===============================
function applyPattern(imageUrl) {
  if (!currentModel) return;

  if (decalMesh) {
    scene.remove(decalMesh);
    decalMesh.geometry.dispose();
    decalMesh.material.dispose();
  }

  const texture = textureLoader.load(imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;

  const decalMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4
  });

  /**
   * 固定贴在「壶正前方」
   * 你后面只需要改 position / size
   */
  const position = new THREE.Vector3(0, 0, 0.6);
  const orientation = new THREE.Euler(0, 0, 0);
  const size = new THREE.Vector3(0.5, 0.5, 0.5);

  const decalGeometry = new DecalGeometry(
    currentModel,
    position,
    orientation,
    size
  );

  decalMesh = new THREE.Mesh(decalGeometry, decalMaterial);
  scene.add(decalMesh);
}

// ===============================
// 左侧按钮：切换模型
// ===============================
document.querySelectorAll('#sidebar button').forEach(btn => {
  btn.addEventListener('click', () => {
    loadModel(btn.dataset.model);
  });
});

// 默认模型
loadModel('models/model1.glb');

// ===============================
// ⭐ 模拟“选择图案”（临时方案）
// 你答辩前可以换成弹窗 UI
// ===============================
window.addEventListener('keydown', (e) => {
  if (e.key === '1') applyPattern('patterns/A.png');
  if (e.key === '2') applyPattern('patterns/B.png');
  if (e.key === '3') applyPattern('patterns/C.png');
  if (e.key === '4') applyPattern('patterns/D.png');
});

// 渲染循环
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// 自适应
window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
