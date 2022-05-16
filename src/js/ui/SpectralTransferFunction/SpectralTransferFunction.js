import { DOMUtils } from '../../utils/DOMUtils.js';
import { CommonUtils } from '../../utils/CommonUtils.js';
import { WebGL } from '../../WebGL.js';
import { Draggable } from '../../Draggable.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders.json',
    'mixins.json',
].map(url => fetch(url).then(response => response.json())));

const [ templateElement, templateBump ] = await Promise.all([
    new URL('./SpectralTransferFunction.html', import.meta.url),
].map(url => fetch(url).then(response => response.text())));

const template = document.createElement('template');
template.innerHTML = templateElement;

export class SpectralTransferFunction extends HTMLElement {

constructor() {
    super();

    this.changeListener = this.changeListener.bind(this);

    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template.content.cloneNode(true));
    this.binds = DOMUtils.bind(this.shadow);

    Object.assign(this, {
        width                  : 256,
        height                 : 256,
        transferFunctionWidth  : 256,
        transferFunctionHeight : 256,
        scaleSpeed             : 0.003
    });

    this.canvas = this.shadow.querySelector('canvas.transfer-function');
    this.canvas.width = this.transferFunctionWidth;
    this.canvas.height = this.transferFunctionHeight;

    this.overlayCanvas = this.shadow.querySelector('canvas.overlay');
    this.overlayCanvas.width = this.transferFunctionWidth;
    this.overlayCanvas.height = this.transferFunctionHeight;
    this.overlayContext = this.overlayCanvas.getContext('2d');
    
    this.resize(this.width, this.height);

    this._gl = this.canvas.getContext('webgl2', {
        depth                 : false,
        stencil               : false,
        antialias             : false,
        preserveDrawingBuffer : true
    });
    const gl = this._gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this._clipQuad = WebGL.createClipQuad(gl);
    this._program = WebGL.buildPrograms(gl, {
        TransferFunction: SHADERS.TransferFunction
    }, MIXINS).TransferFunction;
    const program = this._program;
    gl.useProgram(program.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    gl.enableVertexAttribArray(program.attributes.aPosition);
    gl.vertexAttribPointer(program.attributes.aPosition, 2, gl.FLOAT, false, 0, 0);

    this.bumps = [];

    this.overlayCanvas.addEventListener('mousemove', this.mouseMoveListener.bind(this));

    // this.binds.spectrum.addEventListener('change', this.changeListener);
    this.binds.spectrum.addEventListener('change', function(e) {
        // TODO: Update transfer function when spectrum changes.
        // console.log('Spectrum changed!');
    });

    this.binds.cancelButton.addEventListener('click', function() {
        this.selectionStart = null;
        this.selectionEnd = null;
        this.selection = null;
        this.render();
    }.bind(this));

    this.selectionStart = null;
    this.selectionEnd = null;
    this.selection = null;
}

setSelection(start, end) {
    this.selection = { start: start, end: end };
}

mouseMoveListener(event) {
    let isButtonPressed = event.buttons & 1 === 1;

    if (!isButtonPressed) {
        if (this.selectionStart != null && this.selectionEnd != null)
            this.setSelection(this.selectionStart, this.selectionEnd);
        this.selectionStart = null;
        this.selectionEnd = null;
        this.render();
        return;
    }

    let rectangle = this.overlayCanvas.getBoundingClientRect();
    let x = Math.min(rectangle.width, Math.max(0, event.clientX - rectangle.left));
    // let y = Math.min(rectangle.height, Math.max(0, event.clientY - rectangle.top));

    if (this.selectionStart == null) {
        this.selectionStart = x;
        this.selectionEnd = x;
    } else {
        this.selectionStart = Math.min(this.selectionStart, x);
        this.selectionEnd = Math.max(this.selectionEnd, x);
    }

    this.render();
}

destroy() {
    const gl = this._gl;
    gl.deleteBuffer(this._clipQuad);
    gl.deleteProgram(this._program.program);
}

resize(width, height) {
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.width = width;
    this.height = height;
}

resizeTransferFunction(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.transferFunctionWidth = width;
    this.transferFunctionHeight = height;
    const gl = this._gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

renderOverlay() {
    const ctx = this.overlayContext;
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    if (this.selectionStart != null && this.selectionEnd != null) {
        ctx.fillStyle = "rgba(33, 150, 243, 0.25)";
        let width = this.selectionEnd - this.selectionStart;
        ctx.fillRect(this.selectionStart, 0, width, this.overlayCanvas.height);
    }

    if (this.selection != null) {
        ctx.fillStyle = "rgba(33, 150, 243, 0.5)";
        let width = this.selection.end - this.selection.start;
        ctx.fillRect(this.selection.start, 0, width, this.overlayCanvas.height);
    }
}

render() {
    const gl = this._gl;
    const { uniforms } = this._program;

    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const bump of this.bumps) {
        gl.uniform2f(uniforms.uPosition, bump.position.x, bump.position.y);
        gl.uniform2f(uniforms.uSize, bump.size.x, bump.size.y);
        gl.uniform4f(uniforms.uColor, bump.color.r, bump.color.g, bump.color.b, bump.color.a);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }
    this.renderOverlay();
}

get value() {
    return this.canvas;
}

_addHandle(index) {
    const handle = DOMUtils.instantiate(templateBump);
    this.shadow.querySelector('.widget').appendChild(handle);
    handle.dataset.index = index;

    const left = this.bumps[index].position.x * this.width;
    const top = (1 - this.bumps[index].position.y) * this.height;
    handle.style.left = Math.round(left) + 'px';
    handle.style.top = Math.round(top) + 'px';

    new Draggable(handle, handle.querySelector('.bump-handle'));
    handle.addEventListener('draggable', e => {
        const x = e.currentTarget.offsetLeft / this.width;
        const y = 1 - (e.currentTarget.offsetTop / this.height);
        const i = parseInt(e.currentTarget.dataset.index);
        this.bumps[i].position.x = x;
        this.bumps[i].position.y = y;
        this.render();
        this.dispatchEvent(new Event('change'));
    });
    handle.addEventListener('pointerdown', e => {
        const i = parseInt(e.currentTarget.dataset.index);
        this.selectBump(i);
    });
    handle.addEventListener('wheel', e => {
        const amount = e.deltaY * this.scaleSpeed;
        const scale = Math.exp(-amount);
        const i = parseInt(e.currentTarget.dataset.index);
        this.selectBump(i);
        if (e.shiftKey) {
            this.bumps[i].size.y *= scale;
        } else {
            this.bumps[i].size.x *= scale;
        }
        this.render();
        this.dispatchEvent(new Event('change'));
    });
}

selectBump(index) {
    const handles = this.shadow.querySelectorAll('.bump');
    for (const handle of handles) {
        const handleIndex = parseInt(handle.dataset.index);
        if (handleIndex === index) {
            handle.classList.add('selected');
        } else {
            handle.classList.remove('selected');
        }
    }

    const color = this.bumps[index].color;
    this.binds.color.value = CommonUtils.rgb2hex([color.r, color.g, color.b]);
    this.binds.alpha.value = color.a;
}

getSelectedBumpIndex() {
    const selectedBump = this.shadow.querySelector('.bump.selected');
    if (selectedBump) {
        return parseInt(selectedBump.dataset.index);
    } else {
        return -1;
    }
}

changeListener() {
    const selectedBump = this.shadow.querySelector('.bump.selected');
    const index = parseInt(selectedBump.dataset.index);
    const color = CommonUtils.hex2rgb(this.binds.color.value);
    const alpha = parseFloat(this.binds.alpha.value);
    this.bumps[index].color.r = color[0];
    this.bumps[index].color.g = color[1];
    this.bumps[index].color.b = color[2];
    this.bumps[index].color.a = alpha;
    this.render();
    this.dispatchEvent(new Event('change'));
}

}

customElements.define('ui-spectral-transfer-function', SpectralTransferFunction);
