import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

// 全局变量
let currentModel = null;
let decalMeshNormal = null;   // 只保留法线 decal
let mainMesh = null;
let currentPatternUrl = null; // 记录当前图案URL（用于重新应用）

// DOM 元素
const container = document.getElementById('viewer');

// 1. 基础场景配置
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// 相机
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  200
);
camera.position.set(0, 5, 15);
camera.lookAt(0, 0, 0);

// 渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// 2. 灯光（增强立体感）
scene.add(new THREE.AmbientLight(0xffffff, 1));
const dirLight1 = new THREE.DirectionalLight(0xffffff, 2);
dirLight1.position.set(5, 10, 5);
scene.add(dirLight1);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 2);
dirLight2.position.set(-5, 10, -5);
scene.add(dirLight2);
const pointLight = new THREE.PointLight(0xffffff, 2);
pointLight.position.set(10, 10, 10);
scene.add(pointLight);

// 3. 控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// 4. 加载器
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// ===============================
// 加载模型
// ===============================
function loadModel(url) {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  if (decalMeshNormal) {
    scene.remove(decalMeshNormal);
    decalMeshNormal.geometry.dispose();
    decalMeshNormal.material.dispose();
    decalMeshNormal = null;
  }

  mainMesh = null;

  gltfLoader.load(url, (gltf) => {
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    model.scale.set(20 / maxDim, 20 / maxDim, 20 / maxDim);
    model.position.set(0, -5, 0);

    scene.add(model);
    currentModel = model;

    model.traverse((child) => {
      if (child.isMesh && !mainMesh) {
        mainMesh = child;
      }
    });

    const axesHelper = new THREE.AxesHelper(15);
    scene.add(axesHelper);

    controls.update();

    // 重新应用当前法线图案
    if (currentPatternUrl) {
      applyDecal(currentPatternUrl);
    }
  });
}

// ===============================
// 核心：只投射法线贴图（无颜色贴图，模型显示凹凸纹理）
// ===============================
function applyDecal(imageUrl) {
  if (!currentModel || !mainMesh) {
    alert('请先加载模型！');
    return;
  }

  if (decalMeshNormal) {
    scene.remove(decalMeshNormal);
    decalMeshNormal.geometry.dispose();
    decalMeshNormal.material.dispose();
    decalMeshNormal = null;
  }

  const normalUrl = imageUrl.replace('.png', '_normal.png');

  textureLoader.load(normalUrl, (normalTexture) => {
    normalTexture.colorSpace = THREE.NoColorSpace;
    normalTexture.wrapS = THREE.ClampToEdgeWrapping;
    normalTexture.wrapT = THREE.ClampToEdgeWrapping;

    const normalMaterial = new THREE.MeshStandardMaterial({
  normalMap: normalTexture,
  normalScale: new THREE.Vector2(3.0, 3.0), // 保持你的强度
  color: new THREE.Color(0xffffff),         // 白色基础
  transparent: true,
  opacity: 1,
  side: THREE.FrontSide,
  polygonOffset: true,
  polygonOffsetFactor: -10,
  depthWrite: false,
  depthTest: true,
  roughness: mainMesh.material.roughness,   // 与壶身一致
  metalness: mainMesh.material.metalness,
  emissive: mainMesh.material.emissive.clone(),
  emissiveIntensity: mainMesh.material.emissiveIntensity
});

// 自定义 shader：透明区域强制使用壶身颜色
normalMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.modelColor = { value: mainMesh.material.color.clone() };

  shader.fragmentShader = `
    uniform vec3 modelColor;
  ` + shader.fragmentShader;

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `
    #include <map_fragment>
    diffuseColor.rgb = modelColor; // 强制模型颜色
    diffuseColor.a = 1.0;          // 始终覆盖
    `
  );

  // 移除任何丢弃，确保法线计算完整
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <alphatest_fragment>',
    ''
  );
};

normalMaterial.needsUpdate = true;

    const pos = new THREE.Vector3(10, 1, 1);
    const rot = new THREE.Euler(0, Math.PI / 2, 0);
    const size = new THREE.Vector3(5, 5, 20);

    const normalGeo = new DecalGeometry(mainMesh, pos, rot, size);
    decalMeshNormal = new THREE.Mesh(normalGeo, normalMaterial);
    scene.add(decalMeshNormal);

    renderer.render(scene, camera);
  }, undefined, (err) => {
    console.error('法线贴图加载失败：', err);
  });
}
// ===============================
// 上色（重新应用法线图案）
// ===============================
function changeModelColor(colorHex) {
  if (!currentModel) return;
  currentModel.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: new THREE.Color(colorHex).multiplyScalar(0.2),
        emissiveIntensity: 0.5,
        roughness: 0.5,
        metalness: 0.0
      });
    }
  });

  // 重新应用当前法线图案
  if (currentPatternUrl) {
    applyDecal(currentPatternUrl);
  }
}

// ===============================
// 事件绑定alphatest_fr
// ===============================
document.querySelectorAll('.model-btns button').forEach(btn => {
  btn.addEventListener('click', () => loadModel(btn.dataset.model));
});
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => changeModelColor(btn.dataset.color));
});
document.querySelectorAll('.pattern-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentPatternUrl = btn.dataset.pattern;
    applyDecal(currentPatternUrl);
  });
});

// ===============================
// 渲染循环
// ===============================
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// 窗口调整
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// 默认加载
loadModel('models/model1.glb');
