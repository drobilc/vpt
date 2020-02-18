// #package js/main

// #include ../AbstractDialog.js
// #include ../../TransferFunctionWidget.js

// #include ../../../uispecs/renderers/DOSRendererDialog.json

class DOSRendererDialog extends AbstractDialog {

constructor(renderer, options) {
    super(UISPECS.DOSRendererDialog, options);

    this._renderer = renderer;

    this._handleChange = this._handleChange.bind(this);
    this._handleTFChange = this._handleTFChange.bind(this);

    this._binds.steps.addEventListener('input', this._handleChange);
    this._binds.slices.addEventListener('input', this._handleChange);
    this._binds.angle.addEventListener('input', this._handleChange);

    this._tfwidget = new TransferFunctionWidget();
    this._binds.tfcontainer.add(this._tfwidget);
    this._tfwidget.addEventListener('change', this._handleTFChange);
}

destroy() {
    this._tfwidget.destroy();
    super.destroy();
}

_handleChange() {
    this._renderer.steps = this._binds.steps.getValue();
    this._renderer.slices = this._binds.slices.getValue();
    this._renderer.angle = this._binds.angle.getValue() * Math.PI / 180;
    this._renderer.reset();
}

_handleTFChange() {
    this._renderer.setTransferFunction(this._tfwidget.getTransferFunction());
    this._renderer.reset();
}

}