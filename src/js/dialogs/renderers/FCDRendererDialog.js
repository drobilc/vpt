// #package js/main

// #include ../AbstractDialog.js
// #include ../../TransferFunctionWidget.js

// #include ../../../uispecs/renderers/FCDRendererDialog.json

class FCDRendererDialog extends AbstractDialog {

constructor(renderer, options) {
    super(UISPECS.FCDRendererDialog, options);

    this._renderer = renderer;

    this._handleChange = this._handleChange.bind(this);
    this._handleChangeScettering = this._handleChangeScettering.bind(this);
    this._handleChangeLightDirection = this._handleChangeLightDirection.bind(this);
    this._handleTFChange = this._handleTFChange.bind(this);

    this._binds.steps.addEventListener('input', this._handleChange);
    this._binds.opacity.addEventListener('input', this._handleChange);
    this._binds.direction.addEventListener('input', this._handleChangeLightDirection);
    this._binds.scattering.addEventListener('input', this._handleChangeScettering);
    this._binds.absorptionCoefficient.addEventListener('input', this._handleChange);

    this._tfwidget = new TransferFunctionWidget();
    this._binds.tfcontainer.add(this._tfwidget);
    this._tfwidget.addEventListener('change', this._handleTFChange);
}

destroy() {
    this._tfwidget.destroy();
    super.destroy();
}

_handleChange() {
    this._renderer._stepSize = 1 / this._binds.steps.getValue();
    this._renderer._alphaCorrection = this._binds.opacity.getValue();
    this._renderer._absorptionCoefficient = this._binds.absorptionCoefficient.getValue();

    this._renderer.reset();
}

_handleChangeScettering() {
    this._renderer._scattering = this._binds.scattering.getValue();

    this._renderer._resetDiffusionField();
    this._renderer.reset();
}

_handleChangeLightDirection() {
    const direction = this._binds.direction.getValue();
    this._renderer._lightDirection[0] = direction.x;
    this._renderer._lightDirection[1] = direction.y;
    this._renderer._lightDirection[2] = direction.z;

    this._renderer._resetLightField();
    this._renderer.reset();
}

_handleTFChange() {
    this._renderer.setTransferFunction(this._tfwidget.getTransferFunction());
    this._renderer.reset();
}

}
