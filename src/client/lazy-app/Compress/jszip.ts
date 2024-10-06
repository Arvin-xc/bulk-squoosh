// @ts-ignore
import JSZip from 'jszip/dist/jszip.js';

export const downloadFile = (file: File) => {
  const href = URL.createObjectURL(file);
  var downloadElement = document.createElement('a');
  downloadElement.href = href;
  downloadElement.download = file.name;
  document.body.appendChild(downloadElement);
  downloadElement.click();
  document.body.removeChild(downloadElement);
  window.URL.revokeObjectURL(href);
};

export const onDownloadAll = async (fileList: File[]) => {
  const zip = new JSZip();

  fileList.forEach((file) => {
    zip.file(file.name, file, {
      date: new Date(file.lastModified),
    });
  });

  const zipBuffer = await zip.generateAsync({
    type: JSZip.support.uint8array ? 'uint8array' : 'string',
  });

  const zipFile = new File([zipBuffer], 'bulk-squoohs', {
    type: 'application/zip',
  });

  downloadFile(zipFile);
};
