// #part /glsl/shaders/renderers/SpectralRenderer/generate/vertex

#version 300 es
precision mediump float;

uniform mat4 uMvpInverseMatrix;

layout(location = 0) in vec2 aPosition;
out vec3 vRayFrom;
out vec3 vRayTo;
out vec2 vPosition;

// #link /glsl/mixins/unproject
@unproject

void main() {
    unproject(aPosition, uMvpInverseMatrix, vRayFrom, vRayTo);
    vPosition = (aPosition + 1.0) * 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}

// #part /glsl/shaders/renderers/SpectralRenderer/generate/fragment

#version 300 es
precision mediump float;

#define M_INVPI 0.31830988618

uniform mediump sampler3D uVolume;
uniform mediump sampler2D uTransferFunction;
uniform mediump sampler2D uEnvironment;
uniform mediump sampler2D uLightSpectrum;
uniform float uOffset;
uniform float uSigmaMax;
uniform float uAlphaCorrection;
uniform vec3 uScatteringDirection;

in vec3 vRayFrom;
in vec3 vRayTo;
in vec2 vPosition;
out vec4 oColor;

// #link /glsl/mixins/intersectCube
@intersectCube

// #link /glsl/mixins/XYZColorMatching
@XYZColorMatching

// #link /glsl/mixins/XYZITU2002
@XYZITU2002

vec2 rand(vec2 p) {
    const mat2 M = mat2(
        23.14069263277926, 2.665144142690225,
        12.98987893203892, 78.23376739376591);
    const vec2 D = vec2(
        12345.6789,
        43758.5453);
    vec2 dotted = M * p;
    vec2 mapped = vec2(cos(dotted.x), sin(dotted.y));
    return fract(mapped * D);
}

vec4 sampleEnvironmentMap(vec3 d) {
    vec2 texCoord = vec2(atan(d.x, -d.z), asin(-d.y) * 2.0) * M_INVPI * 0.5 + 0.5;
    return texture(uEnvironment, texCoord);
}

float sampleVolumeWavelengthAbsorption(vec3 position, float lambda) {
    float volumeSample = texture(uVolume, position).r;
    vec4 transferSample = texture(uTransferFunction, vec2(volumeSample, lambda));
    return transferSample.r;
}

float sampleDistance(vec3 from, vec3 to, float lambda, inout vec2 seed) {
    float maxDistance = distance(from, to);
    float dist = 0.0;
    float invSigmaMax = 1.0 / uSigmaMax;
    float invMaxDistance = 1.0 / maxDistance;

    do {
        seed = rand(seed);
        dist -= log(1.0 - seed.x) * invSigmaMax;
        if (dist > maxDistance) {
            break;
        }
        vec3 samplingPosition = mix(from, to, dist * invMaxDistance);
        float alpha = sampleVolumeWavelengthAbsorption(samplingPosition, lambda);
        float alphaSample = alpha * uAlphaCorrection;
        if (seed.y < alphaSample * invSigmaMax) {
            break;
        }
    } while (true);

    return dist;
}

float sampleTransmittance(vec3 from, vec3 to, float lambda, inout vec2 seed) {
    float maxDistance = distance(from, to);
    float dist = 0.0;
    float invSigmaMax = 1.0 / uSigmaMax;
    float invMaxDistance = 1.0 / maxDistance;
    float transmittance = 1.0;

    do {
        seed = rand(seed);
        dist -= log(1.0 - seed.x) * invSigmaMax;
        if (dist > maxDistance) {
            break;
        }
        vec3 samplingPosition = mix(from, to, dist * invMaxDistance);
        float alpha = sampleVolumeWavelengthAbsorption(samplingPosition, lambda);
        float alphaSample = alpha * uAlphaCorrection;
        transmittance *= 1.0 - alphaSample * invSigmaMax;
    } while (true);

    return transmittance;
}

float sampleLight(float lambda) {
    return texture(uLightSpectrum, vec2(lambda, 0.5)).r;
}

void main() {
    vec3 rayDirection = vRayTo - vRayFrom;
    vec3 rayDirectionUnit = normalize(rayDirection);
    vec2 tbounds = max(intersectCube(vRayFrom, rayDirection), 0.0);

    if (tbounds.x >= tbounds.y) {
        oColor = sampleEnvironmentMap(rayDirectionUnit);
    } else {

        vec3 color = vec3(0, 0, 0);

        vec3 from = mix(vRayFrom, vRayTo, tbounds.x);
        vec3 to = mix(vRayFrom, vRayTo, tbounds.y);

        bool atLeastOneHit = false;

        for (uint i = 0u; i < numberOfSamples; i++) {
            // Normalized lambda value in interval [0, 1], where 0 represents
            // the startWavelength and the 1 represents the endWavelength.
            float unitLambda = float(i) / float(numberOfSamples);

            // To convert to value in nanometers, use
            float lambda = mix(startWavelength, endWavelength, unitLambda);

            // If the light doesn't emit light at current lambda, skip tracing.
            float lightIntensity = sampleLight(unitLambda);
            if (lightIntensity <= 0.0001) continue;

            float maxDistance = distance(from, to);
            vec2 seed = vPosition + rand(vec2(uOffset, uOffset));

            float dist = sampleDistance(from, to, unitLambda, seed);

            if (dist > maxDistance) {
                
            } else {
                atLeastOneHit = true;

                from = mix(from, to, dist / maxDistance);
                tbounds = max(intersectCube(from, uScatteringDirection), 0.0);
                to = from + uScatteringDirection * tbounds.y;

                float transmittance = sampleTransmittance(from, to, unitLambda, seed);
                float response = transmittance * lightIntensity;
                color += response * xyzResponseAt(lambda);

            }

        }

        if (atLeastOneHit) {
            oColor = vec4(xyz2rgb(color), 1);
        } else {
            oColor = sampleEnvironmentMap(rayDirectionUnit);
        }

    }
    
}

// #part /glsl/shaders/renderers/SpectralRenderer/integrate/vertex

#version 300 es
precision mediump float;

layout(location = 0) in vec2 aPosition;
out vec2 vPosition;

void main() {
    vPosition = (aPosition + 1.0) * 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}

// #part /glsl/shaders/renderers/SpectralRenderer/integrate/fragment

#version 300 es
precision mediump float;

uniform mediump sampler2D uAccumulator;
uniform mediump sampler2D uFrame;
uniform float uInvFrameNumber;

in vec2 vPosition;
out vec4 oColor;

void main() {
    vec4 acc = texture(uAccumulator, vPosition);
    vec4 frame = texture(uFrame, vPosition);
    oColor = acc + (frame - acc) * uInvFrameNumber;
}

// #part /glsl/shaders/renderers/SpectralRenderer/render/vertex

#version 300 es
precision mediump float;

layout(location = 0) in vec2 aPosition;
out vec2 vPosition;

void main() {
    vPosition = (aPosition + 1.0) * 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}

// #part /glsl/shaders/renderers/SpectralRenderer/render/fragment

#version 300 es
precision mediump float;

uniform mediump sampler2D uAccumulator;

in vec2 vPosition;
out vec4 oColor;

void main() {
    vec4 acc = texture(uAccumulator, vPosition);
    oColor = acc;
}

// #part /glsl/shaders/renderers/SpectralRenderer/reset/vertex

#version 300 es
precision mediump float;

layout(location = 0) in vec2 aPosition;

void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}

// #part /glsl/shaders/renderers/SpectralRenderer/reset/fragment

#version 300 es
precision mediump float;

out vec4 oColor;

void main() {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
}
