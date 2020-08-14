// #package js/main

// #include AbstractDialog.js

// #include ../../uispecs/LightsGroup.json

class LightsDialog extends AbstractDialog {

    constructor(options) {
        super(UISPECS.LightsDialog, options);

        this.groups = [];
        // this.attributes = [];

        this._registerEventListeners();
        this._addEventListeners();

        console.log("Lights Init");
    }

    _registerEventListeners() {
        this._handleAddGroupClick = this._handleAddGroupClick.bind(this);
        this._handleGroupChange = this._handleGroupChange.bind(this);
    }

    _addEventListeners() {
        this._binds.addGroupButton.addEventListener('click', this._handleAddGroupClick);
    }

    _setInitialLights() {
        const group = this._addGroup();
        group.binds.enabled.setChecked(true);
        group.binds.type.setValue('distant');
        group.binds.dirpos.setValue({x: 1, y: 1, z: 1});
        this._handleGroupChange();
    }

    reset() {
        for (const group of this.groups) {
            group.object.destroy();
        }
        this.groups = [];
    }

    // setAttributes(attributes) {
    //     this.attributes = attributes;
    // }

    getGroups() {
        return this.groups.map(group => ({
            enabled: group.binds.enabled.isChecked(),
            type: group.binds.type.getValue(),
            dirpos: group.binds.dirpos.getValue()
        }));
    }

    _handleAddGroupClick() {
        this._addGroup();
    }

    _handleGroupChange() {
        this.trigger('change');
    }

    _addGroup() {
        const group = UI.create(UISPECS.LightsGroup);
        const {object, binds} = group;

        this.groups.push(group);

        this._binds.group_container.add(object);
        binds.spacer._element.classList.add('visibility-group');

        const controlPanel = DOMUtils.instantiate(TEMPLATES.LightsGroupControlPanel);
        const controlPanelButtons = DOMUtils.bind(controlPanel);
        binds.controlPanel._element.appendChild(controlPanel);

        // for (const attribute of this.attributes) {
        //     binds.attribute.addOption(attribute, attribute);
        // }
        // binds.attribute.setValue(this.attributes[0]);

        binds.enabled.setChecked(false);
        group.binds.type.setValue('distant');
        group.binds.dirpos.setValue({x: 1, y: 1, z: 1});

        // controlPanelButtons.up.addEventListener('click', e => this._moveUp(group));
        // controlPanelButtons.down.addEventListener('click', e => this._moveDown(group));
        controlPanelButtons.delete.addEventListener('click', e => this._delete(group));

        binds.enabled.addEventListener('change', this._handleGroupChange);
        binds.type.addEventListener('input', this._handleGroupChange);
        binds.dirpos.addEventListener('input', this._handleGroupChange);

        return group;
    }

    // _moveUp(group) {
    //     const index = this.groups.indexOf(group);
    //     if (index === 0) {
    //         return;
    //     }
    //
    //     const temp = this.groups[index];
    //     this.groups[index] = this.groups[index - 1];
    //     this.groups[index - 1] = temp;
    //
    //     this._binds.group_container._element.insertBefore(
    //         group.object._element, group.object._element.previousSibling);
    //
    //     // this.trigger('retopo');
    // }
    //
    // _moveDown(group) {
    //     const index = this.groups.indexOf(group);
    //     if (index === this.groups.length - 1) {
    //         return;
    //     }
    //
    //     const temp = this.groups[index];
    //     this.groups[index] = this.groups[index + 1];
    //     this.groups[index + 1] = temp;
    //
    //     this._binds.group_container._element.insertBefore(
    //         group.object._element.nextSibling, group.object._element);
    //
    //     // this.trigger('retopo');
    // }

    _delete(group) {
        const index = this.groups.indexOf(group);
        this.groups.splice(index, 1);
        group.object.destroy();

        this.trigger('change');
    }

}