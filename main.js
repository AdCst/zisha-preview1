import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

// 全局变量
let currentModel = null;
let decalMesh = null;   // 合并后的 decal（彩绘 + 法线）
let mainMesh = null;
let currentPatternUrl = null; // 法线图案URL
let currentPaintUrl = 'patterns/color/invisible.png';   // 彩绘图案URL
let currentCapacity = 300;    // 默认 300cc

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

// 2. 灯光
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

  if (decalMesh) {
    scene.remove(decalMesh);
    decalMesh.geometry.dispose();
    decalMesh.material.dispose();
    decalMesh = null;
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

    // 重新应用当前法线和彩绘（如果都有则合并）
    updateDecal();
  });
}

// ===============================
// 新增：更新 decal（合并彩绘 + 法线）
// ===============================
function updateDecal() {
  if (!currentModel || !mainMesh) return;

  if (decalMesh) {
    scene.remove(decalMesh);
    decalMesh.geometry.dispose();
    decalMesh.material.dispose();
    decalMesh = null;
  }

  if (!currentPaintUrl && !currentPatternUrl) return; // 无内容不创建

  // 加载彩绘纹理（如果有）
  let paintPromise = currentPaintUrl ? textureLoader.loadAsync(currentPaintUrl) : Promise.resolve(null);

  // 加载法线纹理（如果有）
  let normalPromise = currentPatternUrl ? textureLoader.loadAsync(currentPatternUrl.replace('.png', '_normal.png')) : Promise.resolve(null);

  Promise.all([paintPromise, normalPromise]).then(([paintTexture, normalTexture]) => {
    if (paintTexture) {
      paintTexture.colorSpace = THREE.SRGBColorSpace;
      paintTexture.wrapS = THREE.ClampToEdgeWrapping;
      paintTexture.wrapT = THREE.ClampToEdgeWrapping;
    }

    if (normalTexture) {
      normalTexture.colorSpace = THREE.NoColorSpace;
      normalTexture.wrapS = THREE.ClampToEdgeWrapping;
      normalTexture.wrapT = THREE.ClampToEdgeWrapping;
    }

    const decalMaterial = new THREE.MeshStandardMaterial({
      map: paintTexture,  // 彩绘颜色（可为null）
      normalMap: normalTexture,  // 法线纹理（可为null）
      normalScale: new THREE.Vector2(1.0, 1.0),
      transparent: true,
      opacity: 1,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      depthWrite: false,
      depthTest: true,
      roughness: mainMesh.material.roughness,
      metalness: mainMesh.material.metalness,
      emissive: mainMesh.material.emissive.clone(),
      emissiveIntensity: mainMesh.material.emissiveIntensity
    });

    decalMaterial.userData.modelColor = mainMesh.material.color.clone();

    decalMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.modelColor = { value: decalMaterial.userData.modelColor };

      shader.fragmentShader = `
        uniform vec3 modelColor;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #include <map_fragment>
        float decalAlpha = sampledDiffuseColor.a;
        vec3 decalColor = sampledDiffuseColor.rgb;
        diffuseColor.rgb = mix(modelColor, decalColor, decalAlpha);
        diffuseColor.a = 1.0; // 始终覆盖
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        '' // 移除丢弃，确保法线计算
      );
    };

    decalMaterial.needsUpdate = true;

    const pos = new THREE.Vector3(10, 1, 1);
    const rot = new THREE.Euler(0, Math.PI / 2, 0);
    const size = new THREE.Vector3(5, 5, 20);

    const decalGeo = new DecalGeometry(mainMesh, pos, rot, size);
    decalMesh = new THREE.Mesh(decalGeo, decalMaterial);
    scene.add(decalMesh);

    renderer.render(scene, camera);
  });
}

// ===============================
// 应用法线图案（更新当前法线URL，然后调用updateDecal）
// ===============================
function applyPattern(patternUrl) {
  currentPatternUrl = patternUrl;
  updateDecal();
}

// ===============================
// 应用彩绘图案（更新当前彩绘URL，然后调用updateDecal）
// ===============================
function applyPaint(paintUrl) {
  currentPaintUrl = paintUrl;
  updateDecal();
}

// ===============================
// 上色（重新应用 decal）
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

  updateDecal();
}

// ===============================
// 事件绑定
// ===============================
document.querySelectorAll('.model-btns button').forEach(btn => {
  btn.addEventListener('click', () => loadModel(btn.dataset.model));
});
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => changeModelColor(btn.dataset.color));
});
document.querySelectorAll('.pattern-btn').forEach(btn => {
  btn.addEventListener('click', () => applyPattern(btn.dataset.pattern));
});
document.querySelectorAll('.paint-btn').forEach(btn => {
  btn.addEventListener('click', () => applyPaint(btn.dataset.paint));
});

// ===============================
// 容量输入处理
// ===============================
const capacityInput = document.getElementById('capacity-input');
const capacityDisplay = document.getElementById('capacity-display');

function updateCapacityDisplay() {
  capacityDisplay.textContent = `当前容量：${currentCapacity} cc`;
}

function validateAndSetCapacity(value) {
  let num = parseInt(value, 10);
  
  if (isNaN(num)) {
    capacityInput.value = currentCapacity;
    return;
  }

  if (num < 100) {
    alert('小心！\n超出最小容量喽～\n已自动调整为 100 cc');
    num = 100;
  } else if (num > 500) {
    alert('小心！\n超出最大容量啦～\n已自动调整为 500 cc');
    num = 500;
  }

  num = Math.round(num / 10) * 10;

  currentCapacity = num;
  capacityInput.value = num;
  updateCapacityDisplay();
}

updateCapacityDisplay();

capacityInput.addEventListener('blur', () => {
  validateAndSetCapacity(capacityInput.value);
});

capacityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    capacityInput.blur();
  }
});

capacityInput.addEventListener('input', () => {
  const val = capacityInput.value;
  capacityInput.value = val.replace(/[^0-9]/g, '');
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



// ===============================
// 清除所有贴图按钮事件
// ===============================
document.getElementById('clear-decal-btn').addEventListener('click', () => {
  currentPatternUrl = null;  // 清空法线
  currentPaintUrl = 'patterns/color/invisible.png';    // 清空彩绘
  updateDecal();             // 更新 decal（移除）
  alert('已清除所有贴图！'); // 可选提示
});
