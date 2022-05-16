// #part /glsl/mixins/PhotonWithWavelength

struct PhotonWithWavelength {
    vec3 position;
    vec3 direction;
    
    // The wavelength of this photon. Since we will only sample a finite number
    // of wavelength bands, the wavelength can be represented using band index.
    float wavelength;

    // The [Photon] holds transmittance and radiance information for RGB colors.
    // Since our photon will only hold information for 1 wavelength, we only
    // need one float.
    float transmittance;
    float radiance;

    uint bounces;
    uint samples;
};
