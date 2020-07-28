// #package js/main

// #include ../WebGL.js
// #include AbstractRenderer.js
// #include ../LightVolume.js

class FCDRenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    Object.assign(this, {
        _light                      : [10, 10, 10],
        _lightType                  : 'point',
        _stepSize                   : 0.00333,
        _alphaCorrection            : 100,
        _absorptionCoefficient      : 0.5,
        _scattering                 : 0.5,
        _lightVolumeRatio           : 1,
        _convectionLimit            : 0,
        _convectionSteps            : 5
    }, options);

    this._programs = WebGL.buildPrograms(this._gl, {
        convection: SHADERS.FCDConvection,
        convectionPL: SHADERS.FCDConvectionPL,
        diffusion: SHADERS.FCDDiffusion,
        generate  : SHADERS.FCDGenerate,
        integrate : SHADERS.FCDIntegrate,
        render    : SHADERS.FCDRender,
        reset     : SHADERS.FCDReset
    }, MIXINS);

    if (this._volume.ready) {
        this._initVolume();
    }
}

setVolume(volume) {
    this._volume = volume;
    this._initVolume();
    this.reset();
}

_initVolume() {
    const volumeDimensions = this._volume.getDimensions('default');
    this._volumeDimensions = volumeDimensions;
    this._setLightVolumeDimensions();
    console.log("Volume Dimensions: " + volumeDimensions.width + " " + volumeDimensions.height + " " + volumeDimensions.depth)
    this._resetLightField();
    this.counter = 0;
}

_setLightVolumeDimensions() {
    const volumeDimensions = this._volumeDimensions;
    this._lightVolumeDimensions = {
        width: Math.floor(volumeDimensions.width / this._lightVolumeRatio),
        height: Math.floor(volumeDimensions.height / this._lightVolumeRatio),
        depth: Math.floor(volumeDimensions.depth / this._lightVolumeRatio)
    };
    console.log("Light Volume Dimensions: " + this._lightVolumeDimensions.width + " " +
        this._lightVolumeDimensions.height + " " + this._lightVolumeDimensions.depth);
}

_createDiffusionLightVolume() {
    const gl = this._gl;
    const dimensions = this._lightVolumeDimensions;
    // Energy density
    this._energyDesityDiffusion = gl.createTexture();

    // TODO separate function in WebGL.js
    gl.bindTexture(gl.TEXTURE_3D, this._energyDesityDiffusion);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R32F, dimensions.width, dimensions.height, dimensions.depth);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    for (let i = 0; i < dimensions.depth; i++) {
        let energyDensityArray = new Float32Array(dimensions.width * dimensions.height).fill(0);
        gl.texSubImage3D(gl.TEXTURE_3D, 0,
            0, 0, i, dimensions.width, dimensions.height, 1,
            gl.RED, gl.FLOAT, new Float32Array(energyDensityArray));
    }
}

_resetLightField() {
    const gl = this._gl;
    console.log("Reset Light Field")
    if (this._energyDensity)
        gl.deleteTexture(this._energyDensity.getEnergyDensity());
    this._energyDensity = new LightVolume(gl,
        this._lightType,
        this._light[0], this._light[1], this._light[2],
        this._lightVolumeDimensions,
        this._lightVolumeRatio);
    this._resetDiffusionField();
    this.counter = 0;
}

_resetDiffusionField() {
    const gl = this._gl;
    console.log("Reset Diffusion Light Field")
    if (this._energyDesityDiffusion)
        gl.deleteTexture(this._energyDesityDiffusion);
    this._createDiffusionLightVolume();

}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });
    if (this._energyDesityDiffusion)
        gl.deleteTexture(this._energyDesityDiffusion);
    if (this._energyDensity)
        gl.deleteTexture(this._energyDensity.getEnergyDensity());
    super.destroy();
}

_resetFrame() {
    const gl = this._gl;

    const program = this._programs.reset;
    gl.useProgram(program.program);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_convection(program) {
    const gl = this._gl;
    const localSizeX = 16
    const localSizeY = 16

    gl.useProgram(program.program);

    gl.bindImageTexture(0, this._energyDensity.getEnergyDensity(), 0, true, 0, gl.READ_WRITE, gl.R32F);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    gl.uniform1i(program.uniforms.uVolume, 1);
    gl.uniform1i(program.uniforms.uTransferFunction, 2);

    const dimensions = this._lightVolumeDimensions;

    gl.uniform3i(program.uniforms.uSize, dimensions.width, dimensions.height, dimensions.depth);

    const lightDirection = this._energyDensity.getDirection();
    gl.uniform3fv(program.uniforms.uLight, lightDirection);
    gl.uniform1f(program.uniforms.uAbsorptionCoefficient, this._absorptionCoefficient)
    gl.uniform1i(program.uniforms.uSteps, Math.floor(this._convectionSteps));

    gl.dispatchCompute(Math.ceil(dimensions.width / localSizeX),
        Math.ceil(dimensions.height / localSizeY),
        dimensions.depth);
}

_diffusion() {
    const gl = this._gl;
    const localSizeX = 16
    const localSizeY = 16

    const program = this._programs.diffusion;
    gl.useProgram(program.program);

    gl.bindImageTexture(0, this._energyDensity.getEnergyDensity(), 0, true, 0, gl.READ_ONLY, gl.R32F);
    gl.bindImageTexture(1, this._energyDesityDiffusion, 0, true, 0, gl.READ_WRITE, gl.R32F);

    const dimensions = this._lightVolumeDimensions;

    gl.uniform3i(program.uniforms.uSize, dimensions.width, dimensions.height, dimensions.depth);
    gl.uniform1f(program.uniforms.scattering, this._scattering);

    gl.dispatchCompute(Math.ceil(dimensions.width / localSizeX),
        Math.ceil(dimensions.height / localSizeY),
        dimensions.depth);
}

_generateFrame() {
    const gl = this._gl;
    if (this._convectionLimit === 0) {
        this._convection(this._getProgramFromLightType());
        this._diffusion();
    }
    else if (this.counter <= this._convectionLimit) {
        this._convection(this._getProgramFromLightType());
        if (this.counter === this._convectionLimit) {
            console.log("Convection done!")
        }
        this.counter++;
    }
    else {
        this._diffusion();
    }

    const program = this._programs.generate;
    gl.useProgram(program.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this._energyDensity.getEnergyDensity());
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_3D, this._energyDesityDiffusion);

    // gl.bindImageTexture(2, this._energyDensity, 0, false, 0, gl.READ_ONLY, gl.R32F);

    gl.uniform1i(program.uniforms.uVolume, 0);
    gl.uniform1i(program.uniforms.uTransferFunction, 1);
    gl.uniform1i(program.uniforms.uEnergyDensity, 2);
    gl.uniform1i(program.uniforms.uEnergyDensityDiffusion, 3);
    gl.uniform1f(program.uniforms.uStepSize, this._stepSize);
    gl.uniform1f(program.uniforms.uAlphaCorrection, this._alphaCorrection);
    gl.uniform1f(program.uniforms.uOffset, Math.random());
    gl.uniformMatrix4fv(program.uniforms.uMvpInverseMatrix, false, this._mvpInverseMatrix.m);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_integrateFrame() {
    const gl = this._gl;

    const program = this._programs.integrate;
    gl.useProgram(program.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    gl.uniform1i(program.uniforms.uAccumulator, 0);
    gl.uniform1i(program.uniforms.uFrame, 1);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_renderFrame() {
    const gl = this._gl;

    const program = this._programs.render;
    gl.useProgram(program.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    gl.uniform1i(program.uniforms.uAccumulator, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getProgramFromLightType() {
    switch(this._lightType) {
        case 'distant': return this._programs.convection;
        case 'point': return this._programs.convectionPL;
    }
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA,
        type           : gl.UNSIGNED_BYTE
    }];
}

_getAccumulationBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA,
        type           : gl.UNSIGNED_BYTE
    }];
}

}
