import { WebGL } from '../WebGL.js';
import { AbstractRenderer } from './AbstractRenderer.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders.json',
    'mixins.json',
].map(url => fetch(url).then(response => response.json())));

export class SpectralRenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    this.registerProperties([
        {
            name: 'extinction',
            label: 'Extinction',
            type: 'spinner',
            value: 1,
            min: 0,
        },
        {
            name: 'lightSpectrum',
            label: 'Light spectrum',
            type: 'spectrum',
            value: new Float32Array(32),
        },
        {
            name: 'transferFunction',
            label: 'Spectral transfer function',
            type: 'spectral-transfer-function',
            value: new Uint8Array(256),
        },
    ]);

    this.addEventListener('change', e => {
        const { name, value } = e.detail;

        if (name === 'transferFunction') {
            this.setTransferFunction(value);
        } else if (name === 'lightSpectrum') {
            this.setLightSpectrum(value);
        }

        if ([
            'extinction',
            'transferFunction',
            'lightSpectrum',
        ].includes(name)) {
            this.reset();
        }
    });

    this._programs = WebGL.buildPrograms(gl, SHADERS.renderers.SpectralRenderer, MIXINS);

    this._frameNumber = 1;

    this.lightSpectrumTexture = WebGL.createTexture(gl, {
        width  : 1,
        height : 1,
        data: new Uint8Array([0, 0, 0, 255]),
        type: gl.UNSIGNED_BYTE,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
        min: gl.NEAREST,
        max: gl.NEAREST,
    });

}

setTransferFunction(transferFunction) {
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, transferFunction);
}

setLightSpectrum(data) {
    this.spectrum = new Uint8Array(data.length * 4);
    for (let i = 0; i < data.length; i++) {
        let value = Math.floor(data[i] * 255);
        this.spectrum[4*i+0] = value;
        this.spectrum[4*i+1] = value;
        this.spectrum[4*i+2] = value;
        this.spectrum[4*i+3] = value;
    }

    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lightSpectrumTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.spectrum);
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });
    gl.deleteTexture(this.lightSpectrumTexture);
    super.destroy();
}

_resetFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    this._frameNumber = 1;
}

_generateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.generate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._environmentTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.lightSpectrumTexture);

    gl.uniform1i(uniforms.uVolume, 0);
    gl.uniform1i(uniforms.uEnvironment, 1);
    gl.uniform1i(uniforms.uTransferFunction, 2);
    gl.uniform1i(uniforms.uLightSpectrum, 3);

    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);
    gl.uniform1f(uniforms.uOffset, Math.random());
    gl.uniform1f(uniforms.uSigmaMax, this.extinction);
    gl.uniform1f(uniforms.uAlphaCorrection, this.extinction);

    // scattering direction
    let x, y, z, length;
    do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        length = Math.sqrt(x * x + y * y + z * z);
    } while (length > 1);
    x /= length;
    y /= length;
    z /= length;
    gl.uniform3f(uniforms.uScatteringDirection, x, y, z);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_integrateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.integrate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);
    gl.uniform1i(uniforms.uFrame, 1);
    gl.uniform1f(uniforms.uInvFrameNumber, 1 / this._frameNumber);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    this._frameNumber += 1;
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT,
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
        internalFormat : gl.RGBA32F,
        type           : gl.FLOAT,
    }];
}

}
