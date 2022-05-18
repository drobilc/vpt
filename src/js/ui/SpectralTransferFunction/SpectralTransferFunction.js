import { DOMUtils } from '../../utils/DOMUtils.js';
import { WebGL } from '../../WebGL.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders.json',
    'mixins.json',
].map(url => fetch(url).then(response => response.json())));

const [ templateElement ] = await Promise.all([
    new URL('./SpectralTransferFunction.html', import.meta.url),
].map(url => fetch(url).then(response => response.text())));

const template = document.createElement('template');
template.innerHTML = templateElement;

class Selection {

    constructor(start, end) {
        this.start = start;
        this.end = end;
        this.spectrum = new Float32Array(32);
    }

    setSpectrum(spectrum) {
        this.spectrum = spectrum;
    }

    contains(x) {
        return x >= this.start && x <= this.end;
    }

    overlaps(start, end) {
        return (this.start <= start) ? start <= this.end : this.start <= end;
    }

    width() {
        return this.end - this.start;
    }

}

export class SpectralTransferFunction extends HTMLElement {

constructor() {
    super();

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

    // A list of currently active selections.
    this.selections = [];

    this.overlayCanvas.addEventListener('mousedown', this.mouseDownListener.bind(this));
    this.overlayCanvas.addEventListener('mouseup', this.mouseUpListener.bind(this));
    this.overlayCanvas.addEventListener('mousemove', this.mouseMoveListener.bind(this));
    this.binds.spectrum.addEventListener('change', this.spectrumChangeListener.bind(this));

    this.binds.cancelButton.addEventListener('click', function() {
        this.resetSelection();
        this.render();
    }.bind(this));

    this.binds.clearButton.addEventListener('click', function() {
        this.resetSelection();
        this.selections = [];
        this.render();
    }.bind(this));

    // Whether the user has clicked on the overlay canvas in some empty space.
    // In this case, a new selection will be created.
    this.isMakingNewSelection = false;

    // Whether the user has clicked on existing selection in overlay canvas. In
    // this case, the existing selection can be moved.
    this.isMovingExistingSelection = false;

    // The start and end x coordinate of the current selection. Used when
    // creating a new selection.
    this.selectionStart = null;
    this.selectionEnd = null;

    this.currentSelection = null;
}

resetSelection() {
    this.selectionStart = null;
    this.selectionEnd = null;
    this.currentSelection = null;
    this.isMakingNewSelection = false;
    this.isMovingExistingSelection = false;
}

findSelection(x) {
    for (let i = 0; i < this.selections.length; i++) {
        if (this.selections[i].contains(x)) {
            return this.selections[i];
        }
    }
    return null;
}

closestRight(x) {
    let minDistance = Infinity;
    let closest = null;
    for (let i = 0; i < this.selections.length; i++) {
        let distance = this.selections[i].start - x;
        if (distance >= 0 && distance < minDistance) {
            minDistance = distance;
            closest = this.selections[i];
        }
    }
    return closest;
}

intersectsWithAny(start, end) {
    for (let i = 0; i < this.selections.length; i++) {
        if (this.selections[i] == this.currentSelection) continue;
        if (this.selections[i].overlaps(start, end))
            return this.selections[i];
    }
    return null;
}

getLocalCoordinates(event) {
    // Compute the mouse coordinates inside the canvas.
    let rectangle = this.overlayCanvas.getBoundingClientRect();
    let x = Math.min(rectangle.width, Math.max(0, event.clientX - rectangle.left));
    let y = Math.min(rectangle.height, Math.max(0, event.clientY - rectangle.top));
    return { x: x, y: y };
}

mouseDownListener(event) {
    let mousePosition = this.getLocalCoordinates(event);

    let clickedSelection = this.findSelection(mousePosition.x);
    if (clickedSelection) {
        // The user has tapped on already existing selection. Allow them to move
        // it.
        this.isMovingExistingSelection = true;
        this.currentSelection = clickedSelection;
        
        // Reuse [this.selectionStart] variable to hold the mouse offset inside
        // the selection.
        this.selectionStart = mousePosition.x - this.currentSelection.start;
    } else {
         // The user has tapped on empty space, start adding a new selection.
        this.isMakingNewSelection = true;
        this.selectionStart = mousePosition.x;
        this.selectionEnd = mousePosition.x;
    }

    this.render();
    
}

mouseUpListener(event) {

    // If the user was making a new selection and they have released the mouse,
    // add a new selection to a list of selections and set it as currently
    // selected, so that the spectrum can be changed.
    if (this.isMakingNewSelection) {
        if ((this.selectionEnd - this.selectionStart) > 0.1) {
            let selection = new Selection(this.selectionStart, this.selectionEnd);
            this.selections.push(selection);
            this.currentSelection = selection;
            this.isMakingNewSelection = false;
            this.selectionStart = null;
            this.selectionEnd = null;
        } else {
            this.isMakingNewSelection = false;
            this.selectionStart = null;
            this.selectionEnd = null;
            this.currentSelection = null;
        }
    } else if (this.isMovingExistingSelection) {
        this.isMovingExistingSelection = false;
        this.selectionStart = null;
    }

    this.render();
}

mouseMoveListener(event) {
    let mousePosition = this.getLocalCoordinates(event);

    if (this.isMakingNewSelection) {
        let newSelectionEnd = Math.max(mousePosition.x, this.selectionStart);
        
        // Make sure the selections don't overlap.
        let nextSelection = this.closestRight(this.selectionStart);
        if (nextSelection) {
            newSelectionEnd = Math.min(nextSelection.start, newSelectionEnd);
        }
        
        this.selectionEnd = newSelectionEnd;
    } else if (this.isMovingExistingSelection) {
        let width = this.currentSelection.width();
        let newStart = mousePosition.x - this.selectionStart;
        // Move the selection only if it doesn't intersect any other selection.
        let intersects = this.intersectsWithAny(newStart, newStart + width);
        if (intersects === null) {
            this.currentSelection.start = newStart;
            this.currentSelection.end = newStart + width;
        }
    }

    this.render();
}

spectrumChangeListener(event) {
    if (!this.currentSelection) return;

    // The change event on spectrum UI object also contains Float32Array of
    // values. Store this into current selection.
    let spectrum = event.detail;
    this.currentSelection.setSpectrum(Float32Array.from(spectrum));
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

updateUI() {
    let displaySpectrum = this.currentSelection !== null;
    this.binds.spectrum.style.display = displaySpectrum ? 'block' : 'none';
}

renderOverlay() {
    const ctx = this.overlayContext;
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    // Render all existing selections.
    for (let i = 0; i < this.selections.length; i++) {
        let selection = this.selections[i];
        // Don't draw current selection.
        if (selection === this.currentSelection) continue;
        ctx.fillStyle = "rgba(150, 150, 150, 0.75)";
        ctx.fillRect(selection.start, 0, selection.width(), this.overlayCanvas.height);

        if (selection.spectrum != null) {
            let width = selection.width();
            let sectionHeight = this.overlayCanvas.height / selection.spectrum.length;
            ctx.fillStyle = "white";

            for (let i = 0; i < selection.spectrum.length; i++) {
                let value = selection.spectrum[i];
                let positionY = i * sectionHeight;
                ctx.fillRect(selection.start, positionY, value * width, sectionHeight);
            }
        }
    }

    if (this.selectionStart != null && this.selectionEnd != null) {
        ctx.fillStyle = "rgba(33, 150, 243, 0.25)";
        let width = this.selectionEnd - this.selectionStart;
        ctx.fillRect(this.selectionStart, 0, width, this.overlayCanvas.height);
    }

    if (this.currentSelection != null) {
        ctx.fillStyle = "rgba(33, 150, 243, 0.5)";
        ctx.fillRect(this.currentSelection.start, 0, this.currentSelection.width(), this.overlayCanvas.height);
        // Draw spectrum inside the current selection
        if (this.currentSelection.spectrum != null) {
            let width = this.currentSelection.width();
            let sectionHeight = this.overlayCanvas.height / this.currentSelection.spectrum.length;
            ctx.fillStyle = "white";

            for (let i = 0; i < this.currentSelection.spectrum.length; i++) {
                let value = this.currentSelection.spectrum[i];
                let positionY = i * sectionHeight;
                ctx.fillRect(this.currentSelection.start, positionY, value * width, sectionHeight);
            }
        }
    }
}

render() {
    const gl = this._gl;
    const { uniforms } = this._program;

    gl.clear(gl.COLOR_BUFFER_BIT);
    /*for (const bump of this.bumps) {
        gl.uniform2f(uniforms.uPosition, bump.position.x, bump.position.y);
        gl.uniform2f(uniforms.uSize, bump.size.x, bump.size.y);
        gl.uniform4f(uniforms.uColor, bump.color.r, bump.color.g, bump.color.b, bump.color.a);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }*/
    this.renderOverlay();
    this.updateUI();
}

get value() {
    return this.canvas;
}

}

customElements.define('ui-spectral-transfer-function', SpectralTransferFunction);
