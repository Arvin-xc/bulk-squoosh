import type { FileDropEvent } from 'file-drop-element';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import type { SnackOptions } from 'shared/custom-els/snack-bar';

import { h, Component, Fragment } from 'preact';

import { linkRef } from 'shared/prerendered-app/util';
import * as style from './style.css';
import 'add-css:./style.css';
import 'file-drop-element';
import 'shared/custom-els/snack-bar';
import Intro from 'shared/prerendered-app/Intro';
import 'shared/custom-els/loading-spinner';
import {
  encoderMap,
  EncoderOptions,
  EncoderState,
  ProcessorState,
} from 'client/lazy-app/feature-meta';
import { cleanSet } from 'client/lazy-app/util/clean-modify';
import { OutputType } from 'client/lazy-app/Compress';

const ROUTE_EDITOR = '/editor';
const ROUTE_BULK = '/bulk';

const defaultBulkSettings = {
  processorState: {
    quantize: { enabled: false, zx: 0, maxNumColors: 256, dither: 1 },
    resize: {
      enabled: false,
      width: 1,
      height: 1,
      scale: 100,
      method: 'lanczos3',
      fitMethod: 'stretch',
      premultiply: true,
      linearRGB: true,
    },
  },
  encoderState: {
    type: 'mozJPEG',
    options: {
      quality: 75,
      baseline: false,
      arithmetic: false,
      progressive: true,
      optimize_coding: true,
      smoothing: 0,
      color_space: 3,
      quant_table: 3,
      trellis_multipass: false,
      trellis_opt_zero: false,
      trellis_opt_table: false,
      trellis_loops: 1,
      auto_subsample: true,
      chroma_subsample: 2,
      separate_chroma_quality: false,
      chroma_quality: 75,
    },
  },
};
const compressPromise = import('client/lazy-app/Compress');
const swBridgePromise = import('client/lazy-app/sw-bridge');
const tablePromise = import('client/lazy-app/Compress/Table');
const optionsPromise = import('client/lazy-app/Compress/Options');

function back() {
  window.history.back();
}

interface Props {}

interface State {
  awaitingShareTarget: boolean;
  files: File[];
  isEditorOpen: Boolean;
  isBulkOpen: boolean;
  bulkSettings: {
    processorState: ProcessorState;
    encoderState?: EncoderState;
  };
  showOptions: boolean;
  Compress?: typeof import('client/lazy-app/Compress').default;
  Table?: typeof import('client/lazy-app/Compress/Table').default;
  Options?: typeof import('client/lazy-app/Compress/Options').default;
}

export default class App extends Component<Props, State> {
  state: State = {
    awaitingShareTarget: new URL(location.href).searchParams.has(
      'share-target',
    ),
    bulkSettings: localStorage.getItem('bulkSettings')
      ? JSON.parse(localStorage.getItem('bulkSettings') as string)
      : { ...defaultBulkSettings },
    showOptions: false,
    isEditorOpen: false,
    isBulkOpen: false,
    files: [],
    Compress: undefined,
  };

  snackbar?: SnackBarElement;

  constructor() {
    super();

    compressPromise
      .then((module) => {
        this.setState({ Compress: module.default });
      })
      .catch(() => {
        this.showSnack('Failed to load app');
      });
    tablePromise
      .then((module) => {
        this.setState({ Table: module.default });
      })
      .catch(() => {
        this.showSnack('Failed to load app');
      });
    optionsPromise
      .then((module) => {
        this.setState({ Options: module.default });
      })
      .catch(() => {
        this.showSnack('Failed to load app');
      });

    swBridgePromise.then(async ({ offliner, getSharedImage }) => {
      offliner(this.showSnack);
      if (!this.state.awaitingShareTarget) return;
      const file = await getSharedImage();
      // Remove the ?share-target from the URL
      history.replaceState('', '', '/');
      this.openEditor();
      this.setState({ files: [], awaitingShareTarget: false });
    });

    // Since iOS 10, Apple tries to prevent disabling pinch-zoom. This is great in theory, but
    // really breaks things on Squoosh, as you can easily end up zooming the UI when you mean to
    // zoom the image. Once you've done this, it's really difficult to undo. Anyway, this seems to
    // prevent it.
    document.body.addEventListener('gesturestart', (event: any) => {
      event.preventDefault();
    });

    window.addEventListener('popstate', this.onPopState);
  }
  async componentDidMount() {
    const search = new URLSearchParams(location.search);
    const url = search.get('url');
    const name = search.get('name') || 'unknown';
    const type = search.get('type') || 'image/jpg';

    if (url?.match(/^blob:/)) {
      const blob = await (await fetch(decodeURIComponent(url))).blob();
      const file = new File([blob], decodeURIComponent(name), {
        type: decodeURIComponent(type),
      });
      this.setState({
        files: [file],
      });
      this.openEditor();
    }
  }

  private onFileDrop = ({ files }: FileDropEvent) => {
    if (!files || files.length === 0) return;
    if (files.length >= 2) {
      this.openBulkTable();
    } else {
      this.openEditor();
    }
    this.setState({ files });
  };

  private onIntroPickFile = (files: File[]) => {
    if (files.length >= 2) {
      this.openBulkTable();
    } else {
      this.openEditor();
    }
    this.setState({ files });
  };

  private showSnack = (
    message: string,
    options: SnackOptions = {},
  ): Promise<string> => {
    if (!this.snackbar) throw Error('Snackbar missing');
    return this.snackbar.showSnackbar(message, options);
  };

  private onPopState = () => {
    this.setState({
      isEditorOpen: location.pathname === ROUTE_EDITOR,
      isBulkOpen: location.pathname === ROUTE_BULK,
    });
  };

  private openEditor = () => {
    if (this.state.isEditorOpen) return;
    // Change path, but preserve query string.
    const editorURL = new URL(location.href);
    editorURL.pathname = ROUTE_EDITOR;
    history.pushState(null, '', editorURL.href);
    this.setState({ isEditorOpen: true });
  };

  private openBulkTable = () => {
    if (this.state.isBulkOpen) return;
    const editorURL = new URL(location.href);
    editorURL.pathname = ROUTE_BULK;
    history.pushState(null, '', editorURL.href);
    this.setState({ isBulkOpen: true });
  };

  private updateOptionsState = (showOptions: boolean) => {
    this.setState({
      showOptions,
    });
  };

  private onEncoderTypeChange = (index: 0 | 1, newType: OutputType): void => {
    this.setState({
      bulkSettings: cleanSet(
        this.state.bulkSettings,
        `encoderState`,
        newType === 'identity'
          ? undefined
          : {
              type: newType,
              options: encoderMap[newType].meta.defaultOptions,
            },
      ),
    });
  };

  private onProcessorOptionsChange = (
    index: 0 | 1,
    options: ProcessorState,
  ): void => {
    this.setState({
      bulkSettings: cleanSet(
        this.state.bulkSettings,
        `processorState`,
        options,
      ),
    });
  };

  private onEncoderOptionsChange = (
    index: 0 | 1,
    options: EncoderOptions,
  ): void => {
    this.setState({
      bulkSettings: cleanSet(
        this.state.bulkSettings,
        `encoderState.options`,
        options,
      ),
    });
  };
  /**
   * This function saves encodedSettings and latestSettings of
   * particular side in browser local storage
   * @param index : (0|1)
   * @returns
   */
  private onSaveBulkSettingClick = async (index: 0 | 1) => {
    const bulkSettings = JSON.stringify(this.state.bulkSettings);
    localStorage.setItem('bulkSettings', bulkSettings);
    // Firing an event when we save side settings in localstorage
    window.dispatchEvent(new CustomEvent('bulkSettings'));
    await this.showSnack('Bulk settings saved', {
      timeout: 1500,
      actions: ['dismiss'],
    });
  };

  /**
   * This function sets the side state with catched localstorage
   * value as per side index provided
   * @param index : (0|1)
   * @returns
   */
  private onImportSideSettingsClick = async (index: 0 | 1) => {
    const rightSideSettingsString = localStorage.getItem('rightSideSettings');

    if (index === 0 && rightSideSettingsString) {
      const oldLeftSideSettings = this.state.bulkSettings;
      const newLeftSideSettings = {
        ...this.state.bulkSettings,
        ...JSON.parse(rightSideSettingsString),
      };
      this.setState({
        bulkSettings: newLeftSideSettings,
      });
      const result = await this.showSnack('Bulk settings imported', {
        timeout: 3000,
        actions: ['undo', 'dismiss'],
      });
      if (result === 'undo') {
        this.setState({
          bulkSettings: oldLeftSideSettings,
        });
      }
      return;
    }
  };
  private onScaleChange(value: number) {
    this.state.bulkSettings.processorState.resize.scale = value;
    this.setState({
      bulkSettings: cleanSet(
        this.state.bulkSettings,
        'processorState.resize.scale',
        value,
      ),
    });
  }
  private async onResetBulkSettings() {
    const preSettings = { ...this.state.bulkSettings };
    this.setState({
      bulkSettings: defaultBulkSettings as {
        processorState: ProcessorState;
        encoderState?: EncoderState;
      },
    });
    const result = await this.showSnack('Reset bulk settings!', {
      timeout: 3000,
      actions: ['undo', 'dismiss'],
    });
    if (result === 'undo') {
      this.setState({
        bulkSettings: preSettings,
      });
    }
  }
  render(
    {}: Props,
    {
      files,
      isEditorOpen,
      isBulkOpen,
      Compress,
      Table,
      awaitingShareTarget,
      Options,
      bulkSettings,
      showOptions,
    }: State,
  ) {
    const showSpinner = awaitingShareTarget || (isEditorOpen && !Compress);

    return (
      <div class={style.app}>
        <file-drop onfiledrop={this.onFileDrop} class={style.drop}>
          {showSpinner ? (
            <loading-spinner class={style.appLoader} />
          ) : isEditorOpen ? (
            Compress && (
              <Compress
                file={files[0]!}
                showSnack={this.showSnack}
                onBack={back}
              />
            )
          ) : isBulkOpen ? (
            Table && (
              <Table onBack={back} settings={bulkSettings} files={files} />
            )
          ) : (
            <Fragment>
              <Intro onFile={this.onIntroPickFile} showSnack={this.showSnack} />
              <div
                class={style.options}
                onClick={(e) => e.stopImmediatePropagation()}
              >
                {showOptions ? (
                  Options && (
                    <Options
                      index={0}
                      onlyConfig={true}
                      mobileView={false}
                      processorState={bulkSettings.processorState}
                      encoderState={bulkSettings.encoderState}
                      onEncoderTypeChange={this.onEncoderTypeChange}
                      onEncoderOptionsChange={this.onEncoderOptionsChange}
                      onProcessorOptionsChange={this.onProcessorOptionsChange}
                      onCopyToOtherSideClick={(e) => {}}
                      onSaveSideSettingsClick={this.onSaveBulkSettingClick}
                      onImportSideSettingsClick={this.onImportSideSettingsClick}
                      onScaleChange={(value) => this.onScaleChange(value)}
                      onResetBulkSettings={() => this.onResetBulkSettings()}
                    />
                  )
                ) : (
                  <div
                    class={style.optionsButton}
                    onClick={(e) => {
                      e.stopImmediatePropagation();
                      this.updateOptionsState(true);
                    }}
                  >
                    <svg
                      class="icon"
                      viewBox="0 0 1024 1024"
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      p-id="4266"
                      width="60"
                      fill="var(--pink)"
                      height="60"
                    >
                      <path
                        d="M512 662c82 0 150-68 150-150s-68-150-150-150-150 68-150 150 68 150 150 150zM830 554l90 70c8 6 10 18 4 28l-86 148c-6 10-16 12-26 8l-106-42c-22 16-46 32-72 42l-16 112c-2 10-10 18-20 18l-172 0c-10 0-18-8-20-18l-16-112c-26-10-50-24-72-42l-106 42c-10 4-20 2-26-8l-86-148c-6-10-4-22 4-28l90-70c-2-14-2-28-2-42s0-28 2-42l-90-70c-8-6-10-18-4-28l86-148c6-10 16-12 26-8l106 42c22-16 46-32 72-42l16-112c2-10 10-18 20-18l172 0c10 0 18 8 20 18l16 112c26 10 50 24 72 42l106-42c10-4 20-2 26 8l86 148c6 10 4 22-4 28l-90 70c2 14 2 28 2 42s0 28-2 42z"
                        p-id="4267"
                      ></path>
                    </svg>
                  </div>
                )}
              </div>
            </Fragment>
          )}
          <snack-bar ref={linkRef(this, 'snackbar')} />
        </file-drop>
      </div>
    );
  }
}
