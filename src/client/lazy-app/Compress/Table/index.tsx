import { Component, Fragment, h } from 'preact';
import { DownloadIcon, EditIcon } from 'client/lazy-app/icons';
import PQueue from 'p-queue';
import * as style from './style.css';
import 'add-css:./style.css';
import {
  encoderMap,
  EncoderState,
  ProcessorState,
} from 'client/lazy-app/feature-meta';
import {
  compressImage,
  decodeImage,
  processImage,
  processSvg,
} from '../squoosh';
import { drawableToImageData } from 'client/lazy-app/util/canvas';
import WorkerBridge from 'client/lazy-app/worker-bridge';
import { SourceImage } from '..';
import { onDownloadAll } from '../jszip';

interface Task {
  file: File;
  status: 'pending' | 'finished' | 'error';
  response?: File;
  previewURL: string;
}
interface Props {
  files: File[];
  onBack: () => void;
  settings: {
    processorState: ProcessorState;
    encoderState?: EncoderState;
  };
}

interface State {
  tasks: Task[];
}

export default class Table extends Component<Props, State> {
  state: State = {
    tasks: [],
  };
  private readonly workerBridge = new WorkerBridge();
  private queue = new PQueue({
    concurrency: navigator.hardwareConcurrency - 2 || 1,
  });
  componentDidMount() {
    const tasks: Task[] = this.props.files.map((file, index) => {
      this.queue.add(() =>
        this.compressImage(file).then((compressImage) => {
          this.setState((preState) => {
            const newTasks = [...preState.tasks];

            URL.revokeObjectURL(newTasks[index].previewURL);

            newTasks[index] = {
              status: 'finished',
              response: compressImage,
              file,
              previewURL: URL.createObjectURL(compressImage),
            };
            return {
              ...preState,
              tasks: newTasks,
            };
          });
        }),
      );
      return {
        file,
        status: 'pending',
        previewURL: URL.createObjectURL(file),
      };
    });

    this.setState({
      tasks,
    });
  }
  componentWillUnmount() {
    this.state.tasks.forEach((task) => URL.revokeObjectURL(task.previewURL));
  }

  private edit(url: string, name: string, type: string) {
    window.open(
      `${location.origin}?url=${encodeURIComponent(
        url,
      )}&name=${encodeURIComponent(name)}&${encodeURIComponent(type)}`,
      '_blank',
    );
  }
  private async compressImage(file: File) {
    const mainAbortController = new AbortController();
    const mainSignal = mainAbortController.signal;
    let decoded: ImageData;
    let vectorImage: HTMLImageElement | undefined;
    if (file.type.startsWith('image/svg+xml')) {
      vectorImage = await processSvg(mainSignal, file);
      decoded = drawableToImageData(vectorImage);
    } else {
      decoded = await decodeImage(mainSignal, file, this.workerBridge);
    }

    let source: SourceImage = {
      decoded,
      vectorImage,
      preprocessed: decoded,
      file,
    };

    const processorState = this.props.settings.processorState;
    if (processorState.resize.enabled && processorState.resize.scale) {
      processorState.resize.width = Math.floor(
        (decoded.width * processorState.resize.scale) / 100,
      );
      processorState.resize.height = Math.floor(
        (decoded.height * processorState.resize.scale) / 100,
      );
    }
    const processed = await processImage(
      mainSignal,
      source,
      processorState,
      this.workerBridge,
    );
    const compressedFile = await compressImage(
      mainSignal,
      processed,
      this.props.settings.encoderState || {
        type: 'mozJPEG',
        options: encoderMap.mozJPEG.meta.defaultOptions,
      },
      source.file.name,
      this.workerBridge,
    );
    return compressedFile;
  }
  private downloadAll(tasks: Task[]) {
    const files = tasks
      .map((task) => task.response)
      .filter((file) => !!file) as File[];
    onDownloadAll(files);
  }
  private onDownload = () => {
    ga('send', 'event', 'compression', 'download');
  };

  render() {
    const { tasks } = this.state;
    const finishedAll = !tasks.some((task) => task.status === 'pending');
    return (
      <Fragment>
        <button class={style.back} onClick={this.props.onBack}>
          <svg viewBox="0 0 61 53.3">
            <title>Back</title>
            <path
              class={style.backBlob}
              d="M0 25.6c-.5-7.1 4.1-14.5 10-19.1S23.4.1 32.2 0c8.8 0 19 1.6 24.4 8s5.6 17.8 1.7 27a29.7 29.7 0 01-20.5 18c-8.4 1.5-17.3-2.6-24.5-8S.5 32.6.1 25.6z"
            />
            <path
              class={style.backX}
              d="M41.6 17.1l-2-2.1-8.3 8.2-8.2-8.2-2 2 8.2 8.3-8.3 8.2 2.1 2 8.2-8.1 8.3 8.2 2-2-8.2-8.3z"
            />
          </svg>
        </button>
        <div class={style.background}></div>
        <div class={style.table}>
          {tasks.map((task) => (
            <div class={style.card}>
              <img class={style.previewImg} src={task.previewURL} />
              {task.status === 'pending' && (
                <div class={style.pending}>
                  <loading-spinner />
                </div>
              )}

              <div class={style.cardOptions}>
                {task.response && (
                  <Fragment>
                    <div
                      class={style.icon}
                      onClick={() =>
                        this.edit(
                          task.previewURL,
                          task.response?.name!,
                          task.response?.type!,
                        )
                      }
                    >
                      <EditIcon />
                    </div>
                    <a
                      class={style.download}
                      href={task.previewURL}
                      download={task.response?.name}
                      title="Download"
                      onClick={this.onDownload}
                    >
                      <div class={style.icon}>
                        <DownloadIcon />
                      </div>
                    </a>
                  </Fragment>
                )}
              </div>
            </div>
          ))}
        </div>
        <div
          class={finishedAll ? style.download : style.downloadDisable}
          title="Download"
          style="position: fixed; right:12px;bottom:12px;width:93px; height:93px;z-index:200;"
          onClick={() => this.downloadAll(tasks)}
        >
          <svg class={style.downloadBlobs} viewBox="0 0 89.6 86.9">
            <title>Download</title>
            <path d="M27.3 72c-8-4-15.6-12.3-16.9-21-1.2-8.7 4-17.8 10.5-26s14.4-15.6 24-16 21.2 6 28.6 16.5c7.4 10.5 10.8 25 6.6 34S64.1 71.8 54 73.6c-10.2 2-18.7 2.3-26.7-1.6z" />
            <path d="M19.8 24.8c4.3-7.8 13-15 21.8-15.7 8.7-.8 17.5 4.8 25.4 11.8 7.8 6.9 14.8 15.2 14.7 24.9s-7.1 20.7-18 27.6c-10.8 6.8-25.5 9.5-34.2 4.8S18.1 61.6 16.7 51.4c-1.3-10.3-1.3-18.8 3-26.6z" />
          </svg>
          <div class={style.downloadIcon}>
            <DownloadIcon />
          </div>
          {!finishedAll && <loading-spinner />}
        </div>
      </Fragment>
    );
  }
}
