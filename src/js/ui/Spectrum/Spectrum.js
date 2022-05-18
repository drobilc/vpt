import { DOMUtils } from '../../utils/DOMUtils.js';

const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./Spectrum.html', import.meta.url))
    .then(response => response.text());

export class Spectrum extends HTMLElement {

constructor() {
    super();

    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template.content.cloneNode(true));
    this.binds = DOMUtils.bind(this.shadow);
    
    this.canvas = this.binds.canvas;
    this.context = this.canvas.getContext('2d');
    
    // Set constant width and height for canvas. Make sure to change it in
    // [Spectrum.css] if you want to change the height.
    this.canvas.width = 300;
    this.canvas.height = 100;

    this.spectrum = new Float32Array(32);

    let resetButton = this.binds.reset;
    this.resetButtonClickListener = this.resetButtonClickListener.bind(this);
    resetButton.addEventListener('click', this.resetButtonClickListener);

    this.pointerdownListener = this.pointerdownListener.bind(this);
    this.pointerupListener = this.pointerupListener.bind(this);
    this.pointermoveListener = this.pointermoveListener.bind(this);

    this._updateUI();

    this.canvas.addEventListener('pointerdown', this.pointerdownListener);
}

get value() {
    return this.spectrum;
}

_updateUI() {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = "#2196f3";
    const bandWidth = this.canvas.width / this.spectrum.length;

    // First, draw line connecting all the spectrum points.
    ctx.beginPath();
    let firstX = 0.5 * bandWidth;
    let firstY = this.canvas.height * (1 - this.spectrum[0]);
    ctx.moveTo(firstX, firstY);;
    for (let i = 1; i < this.spectrum.length; i++) {
        let x = (i + 0.5) * bandWidth;
        let y = this.canvas.height * (1 - this.spectrum[i]);
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.closePath();

    // Then, draw circles of the spectrum.
    for (let i = 0; i < this.spectrum.length; i++) {
        let x = (i + 0.5) * bandWidth;
        let y = this.canvas.height * (1 - this.spectrum[i]);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI, false);
        ctx.closePath();
        ctx.fill();
    }

}

static observedAttributes = [];

attributeChangedCallback(name) {
    this._updateUI();
}

_setValueByEvent(e) {
    let rect = this.canvas.getBoundingClientRect();
    let x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
    let y = Math.min(rect.height, Math.max(0, e.clientY - rect.top));

    let bandIndex = Math.round((x / rect.width) * this.spectrum.length);
    let value = 1 - (y / rect.height);
    this.spectrum[bandIndex] = value;
    this._updateUI();
    this.dispatchEvent(new CustomEvent('change', { detail: this.spectrum }));
}

pointerdownListener(e) {
    this.setPointerCapture(e.pointerId);
    this.addEventListener('pointerup', this.pointerupListener);
    this.addEventListener('pointermove', this.pointermoveListener);
    this._setValueByEvent(e);
}

pointerupListener(e) {
    this.releasePointerCapture(e.pointerId);
    this.removeEventListener('pointerup', this.pointerupListener);
    this.removeEventListener('pointermove', this.pointermoveListener);
    this._setValueByEvent(e);
}

pointermoveListener(e) {
    this._setValueByEvent(e);
}

resetButtonClickListener(e) {
    for (let i = 0; i < this.spectrum.length; i++) {
        this.spectrum[i] = 0;
    }
    this._updateUI();
    this.dispatchEvent(new CustomEvent('change', { detail: this.spectrum }));
}

}

customElements.define('ui-spectrum', Spectrum);
