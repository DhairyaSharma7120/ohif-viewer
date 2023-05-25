/* eslint-disable react-hooks/rules-of-hooks */
import React, { useEffect, useRef } from 'react';
import classnames from 'classnames';
import { useLocation, useNavigate } from 'react-router-dom';
import { DicomMetadataStore, MODULE_TYPES } from '@ohif/core';

import Dropzone from 'react-dropzone';
import filesToStudies from './filesToStudies';

import { extensionManager } from '../../App';

import { Icon, Button, LoadingIndicatorProgress } from '@ohif/ui';
import JSZip from 'jszip';

const getLoadButton = (onDrop, text, isDir) => {
  return (
    <Dropzone onDrop={onDrop} noDrag>
      {({ getRootProps, getInputProps }) => (
        <div {...getRootProps()}>
          <Button
            rounded="full"
            variant="contained" // outlined
            disabled={false}
            endIcon={<Icon name="launch-arrow" />} // launch-arrow | launch-info
            className={classnames('font-medium', 'ml-2')}
            onClick={() => { }}
          >
            {text}
            {isDir ? (
              <input
                {...getInputProps()}
                webkitdirectory="true"
                mozdirectory="true"
              />
            ) : (
              <input {...getInputProps()} />
            )}
          </Button>
        </div>
      )}
    </Dropzone>
  );
};

type LocalProps = {
  modePath: string;
};

function s3({ modePath }: LocalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const dropzoneRef = useRef();
  const [dropInitiated, setDropInitiated] = React.useState(false);

  // Initializing the dicom local dataSource
  const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
  const localDataSources = dataSourceModules.reduce((acc, curr) => {
    const mods = [];
    curr.module.forEach(mod => {
      if (mod.type === 'localApi') {
        mods.push(mod);
      }
    });
    return acc.concat(mods);
  }, []);

  const firstLocalDataSource = localDataSources[0];
  const dataSource = firstLocalDataSource.createDataSource({});

  const microscopyExtensionLoaded = extensionManager.registeredExtensionIds.includes(
    '@ohif/extension-dicom-microscopy'
  );

  const onDropUsingS3Link = async acceptedFile => {
    const dcmFIleResponse = await fetch(acceptedFile);
    const dcmFIleResponseBlob = await dcmFIleResponse.blob();
    const file = new File([dcmFIleResponseBlob], 'name');
    onDrop([file]);
  };

  const getExtractFiles = extractedFiles => {
    let arrayOfFiles = [];
    extractedFiles.forEach((relativePath, file) => {
      arrayOfFiles.push(file);
    });
    arrayOfFiles = arrayOfFiles.filter(file => {
      const fileName = file.name.split('/')[1];
      return fileName.length;
    });
    return arrayOfFiles.map(async file => {
      const content = await file.async('blob');
      const fileName = file.name.split('/')[1];
      let extractedFile = null;
      if (fileName === 'DICOMDIR') {
        extractedFile = new File([content], fileName, { type: '' });
      } else if (fileName.length) {
        extractedFile = new File([content], fileName, {
          type: 'application/dicom',
        });
      }

      if (extractedFile) {
        return extractedFile;
      }
    });
  };

  const onDropFolderUsingS3Link = async acceptedFile => {
    const dcmFIleResponse = await fetch(acceptedFile);

    const dcmFIleResponseBlob = await dcmFIleResponse.blob();

    const file = new File([dcmFIleResponseBlob], 'zipName.zip', {
      type: dcmFIleResponseBlob.type,
    });

    const zip = new JSZip();

    const extractedFiles = await zip.loadAsync(file);

    const arrayOfFiles = Promise.all(getExtractFiles(extractedFiles));
    arrayOfFiles.then(data => onDrop(data));
  };

  const onDrop = async acceptedFiles => {
    const studies = await filesToStudies(acceptedFiles, dataSource);
    const query = new URLSearchParams();

    if (microscopyExtensionLoaded) {
      // TODO: for microscopy, we are forcing microscopy mode, which is not ideal.
      //     we should make the local drag and drop navigate to the worklist and
      //     there user can select microscopy mode
      const smStudies = studies.filter(id => {
        const study = DicomMetadataStore.getStudy(id);
        return (
          study.series.findIndex(
            s => s.Modality === 'SM' || s.instances[0].Modality === 'SM'
          ) >= 0
        );
      });

      if (smStudies.length > 0) {
        smStudies.forEach(id => query.append('StudyInstanceUIDs', id));

        modePath = 'microscopy';
      }
    }

    // Todo: navigate to work list and let user select a mode
    studies.forEach(id => query.append('StudyInstanceUIDs', id));
    query.append('datasources', 'dicomlocal');
    setDropInitiated(false);
    navigate(`/${modePath}?${decodeURIComponent(query.toString())}`);
  };

  // Set body style
  useEffect(() => {
    setDropInitiated(true);
    const s3LinkSearchParam = new URLSearchParams(location.search);
    const s3Link = s3LinkSearchParam.get('link');
    if (s3Link.length) {
      const s3LinkSplit = s3Link.split('.');
      const s3LinkExtention = s3LinkSplit[s3LinkSplit.length - 1];
      if (s3LinkExtention === 'zip') {
        onDropFolderUsingS3Link(s3Link);
      }
      if (s3LinkExtention === 'dcm') {
        onDropUsingS3Link(s3Link);
      }
    }
  }, []);

  return (
    <Dropzone
      ref={dropzoneRef}
      onDrop={acceptedFiles => {
        setDropInitiated(true);
        onDrop(acceptedFiles);
      }}
      noClick
    >
      {({ getRootProps }) => (
        <div {...getRootProps()} style={{ width: '100%', height: '100%' }}>
          <div className="h-screen w-screen flex justify-center items-center ">
            <div className="py-8 px-8 mx-auto bg-secondary-dark drop-shadow-md space-y-2 rounded-lg">
              <div className="text-center space-y-2 pt-4">
                {dropInitiated ? (
                  <div className="flex flex-col items-center justify-center pt-48">
                    <LoadingIndicatorProgress
                      className={'w-full h-full bg-black'}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-blue-300 text-base">
                      Wait while we load your files from s3
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dropzone>
  );
}

export default s3;
