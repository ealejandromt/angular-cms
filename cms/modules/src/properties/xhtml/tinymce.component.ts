import { Component, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { CmsProperty } from '@angular-cms/core';

@Component({
    template: `
        <div class="form-group row" [formGroup]="formGroup">
            <label [attr.for]="id" class="col-sm-4 col-form-label">{{label}}</label>
            <div class="col-sm-8">
                <editor [id]="id" [formControlName]="propertyName" [init]="{ base_url: '/tinymce', suffix: '.min'  }"></editor>
            </div>
        </div>
    `
})
export class TinymceComponent extends CmsProperty {
}