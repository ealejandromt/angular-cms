import { Media, MediaService, MEDIA_TYPE } from '@angular-cms/core';
import { Component, ViewChild, OnInit } from '@angular/core';
import { takeUntil, switchMap, map, tap, distinctUntilKeyChanged } from 'rxjs/operators';

import { SubjectService } from '../shared/services/subject.service';
import { SubscriptionDestroy } from '../shared/subscription-destroy';
import { TreeComponent } from '../shared/tree/components/tree.component';
import { TreeConfig } from '../shared/tree/interfaces/tree-config';
import { NodeMenuItemAction, TreeMenuActionEvent } from '../shared/tree/interfaces/tree-menu';
import { TreeNode } from '../shared/tree/interfaces/tree-node';
import { MediaTreeService } from './media-tree.service';
import { FileModalComponent } from './upload/file-modal.component';
import { UploadService } from './upload/upload.service';
import { TreeService } from '../shared/tree/interfaces/tree-service';
import { BehaviorSubject, Observable, Subject, merge } from 'rxjs';

const MEDIA_MENU_ACTION = {
    DeleteFolder: 'DeleteFolder',
    NewFileUpload: 'NewFile'
};

@Component({
    template: `
        <div dragOver class="media-container">
            <div class="drop-zone" dragLeave>
                <file-drop [uploadFieldName]='"files"' [targetFolder]="selectedFolder"></file-drop>
            </div>
            <as-split direction="vertical" gutterSize="4">
                <as-split-area size="50">
                    <cms-tree
                        class="tree-root pl-1 pt-2 d-block"
                        [root]="root"
                        [config]="treeConfig"
                        (nodeSelected)="folderSelected$.next($event)"
                        (nodeInlineCreated)="createMediaFolder($event)"
                        (nodeInlineUpdated)="updateMediaFolder($event)"
                        (menuItemSelected)="menuItemSelected($event)">
                        <ng-template #treeNodeTemplate let-node>
                            <span [ngClass]="{'media-node': node.id != '0', 'border-bottom': node.isSelected && node.id != '0'}">
                                <fa-icon class="mr-1" *ngIf="node.id == 0" [icon]="['fas', 'photo-video']"></fa-icon>
                                <fa-icon class="mr-1" *ngIf="node.id != 0" [icon]="['fas', 'folder']"></fa-icon>
                                <span class="node-name">{{node.name}}</span>
                                <button type="button"
                                    class="btn btn-xs btn-secondary float-right mr-1"
                                    *ngIf="node.id == '0'" (click)="clickToCreateFolder(node)">
                                    <fa-icon [icon]="['fas', 'folder-plus']"></fa-icon>
                                </button>
                            </span>
                        </ng-template>
                    </cms-tree>
                </as-split-area>
                <as-split-area size="50">
                    <div class="list-group list-media"  *ngIf="medias$ |async as medias" #mediaItem>
                        <a *ngFor="let media of medias"
                            [draggable]
                            [dragData]="media"
                            class="list-group-item list-group-item-action flex-column align-items-start p-1"
                            [routerLink]="['content/media', media._id]">
                            <div class="d-flex align-items-center">
                                <img width='50' class="mr-1" [src]='media.thumbnail | absolute'/>
                                <div class="w-100 mr-2 text-truncate">{{media.name}}</div>
                                <fa-icon class="ml-auto" [icon]="['fas', 'bars']"></fa-icon>
                            </div>
                        </a>
                    </div>
                </as-split-area>
            </as-split>
            <file-modal></file-modal>
        </div>
        `,
    styleUrls: ['./media-tree.scss'],
    providers: [MediaTreeService, { provide: TreeService, useExisting: MediaTreeService }]
})
export class MediaTreeComponent extends SubscriptionDestroy implements OnInit {

    @ViewChild(TreeComponent, { static: false }) cmsTree: TreeComponent;
    @ViewChild(FileModalComponent, { static: false }) fileModal: FileModalComponent;

    folderSelected$: BehaviorSubject<Partial<TreeNode>>;
    refreshFolder$: Subject<Partial<TreeNode>>;
    medias$: Observable<Media[]>;
    root: TreeNode;
    treeConfig: TreeConfig;
    selectedFolder: Partial<TreeNode>;

    constructor(
        private mediaService: MediaService,
        private subjectService: SubjectService,
        private uploadService: UploadService) {
        super();
        this.root = new TreeNode({ id: '0', name: 'Media', hasChildren: true });
        this.selectedFolder = this.root;
        this.folderSelected$ = new BehaviorSubject<Partial<TreeNode>>(this.root);
        this.refreshFolder$ = new Subject<Partial<TreeNode>>();
        this.treeConfig = this.initTreeConfiguration();
    }

    ngOnInit() {
        this.subjectService.mediaFolderCreated$
            .pipe(takeUntil(this.unsubscribe$))
            .subscribe(createdFolder => {
                this.cmsTree.selectNode({ id: createdFolder._id, isNeedToScroll: true });
                this.cmsTree.reloadSubTree(createdFolder.parentId);
            });

        this.uploadService.uploadComplete$
            .pipe(takeUntil(this.unsubscribe$))
            .subscribe(nodeId => {
                // Reload current node
                if (this.selectedFolder.id === nodeId) { this.refreshFolder$.next(this.selectedFolder); }
            });

        const setFolderSelected$ = this.folderSelected$.pipe(
            distinctUntilKeyChanged('id'),
            tap(node => this.selectedFolder = node)
        );
        this.medias$ = merge(setFolderSelected$, this.refreshFolder$).pipe(
            switchMap(node => this.mediaService.getContentInFolder(node.id)),
            map((medias: Media[]) => medias.map(media => Object.assign(media, {
                type: MEDIA_TYPE,
                contentType: media.contentType,
                isPublished: media.isPublished
            })))
        );
    }

    clickToCreateFolder(node: TreeNode) {
        this.cmsTree.handleNodeMenuItemSelected({ action: NodeMenuItemAction.NewNodeInline, node });
    }

    createMediaFolder(node: TreeNode) {
        this.mediaService.createFolder({ name: node.name, parentId: node.parentId })
            .subscribe(folder => {
                this.subjectService.fireMediaFolderCreated(folder);
            });
    }

    updateMediaFolder(node: TreeNode) {
        this.mediaService.editFolder({ name: node.name, _id: node.id })
            .subscribe();
    }

    menuItemSelected(nodeAction: TreeMenuActionEvent) {
        const { action, node } = nodeAction;
        switch (action) {
            case MEDIA_MENU_ACTION.NewFileUpload:
                this.fileModal.openFileUploadModal(node);
                break;
            case MEDIA_MENU_ACTION.DeleteFolder:
                this.folderDelete(node);
                break;
        }
    }

    private folderDelete(nodeToDelete: TreeNode) {
        if (nodeToDelete.id == '0') { return; }
        this.mediaService.softDeleteContent(nodeToDelete.id).subscribe(([folderToDelete, deleteResult]: [Media, any]) => {
            console.log(deleteResult);
            this.cmsTree.reloadSubTree(nodeToDelete.parentId);
        });
    }

    private initTreeConfiguration(): TreeConfig {
        return {
            menuItems: [
                {
                    action: NodeMenuItemAction.NewNodeInline,
                    name: 'New Folder'
                },
                {
                    action: MEDIA_MENU_ACTION.NewFileUpload,
                    name: 'Upload'
                },
                {
                    action: NodeMenuItemAction.EditNowInline,
                    name: 'Rename'
                },
                {
                    action: NodeMenuItemAction.Copy,
                    name: 'Copy'
                },
                {
                    action: NodeMenuItemAction.Paste,
                    name: 'Paste'
                },
                {
                    action: MEDIA_MENU_ACTION.DeleteFolder,
                    name: 'Delete'
                },
            ]
        };
    }
}
