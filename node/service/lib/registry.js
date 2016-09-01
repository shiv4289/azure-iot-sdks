// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

'use strict';

var uuid = require('uuid');
var anHourFromNow = require('azure-iot-common').anHourFromNow;
var ArgumentError = require('azure-iot-common').errors.ArgumentError;
var endpoint = require('azure-iot-common').endpoint;
var HttpHelper = require('azure-iot-http-base').Http;
var ConnectionString = require('./connection_string.js');
var translateError = require('./registry_http_errors.js');
var SharedAccessSignature = require('./shared_access_signature.js');
var PackageJson = require('../package.json');

/**
 * @class           module:azure-iothub.Registry
 * @classdesc       Constructs a Registry object with the given configuration
 *                  object. The Registry class provides access to the IoT Hub
 *                  identity service. Normally, consumers will call one of the
 *                  factory methods, e.g.,
 *                  {@link module:azure-iothub.Registry.fromConnectionString|fromSharedAccessSignature},
 *                  to create a Registry object.
 * @param {Object}  config      An object containing the necessary information to connect to the IoT Hub instance:
 *                              - host: the hostname for the IoT Hub instance
 *                              - sharedAccessSignature: A shared access signature with valid access rights and expiry. 
 * @param {Object}  httpHelper  (optional) if nothing is passed azure-iot-http-base.Http will be used.
 *                              If passed, this parameter should have the same methods as azure-iot-http-base.Http.
 *                              This parameter is used for mocking and unit-testing and probably should not be used outside of this scenario.
 */
/*Codes_SRS_NODE_IOTHUB_REGISTRY_05_001: [The Registry constructor shall accept a transport object]*/
function Registry(config, httpHelper) {
  if (!config) {
    /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_023: [The `Registry` constructor shall throw a `ReferenceError` if the config object is falsy.]*/
    throw new ReferenceError('The \'config\' parameter cannot be \'' + config + '\'');
  } else if (!config.host || !config.sharedAccessSignature) {
    /*SRS_NODE_IOTHUB_REGISTRY_05_001: [** The `Registry` constructor shall throw an `ArgumentException` if the config object is missing one or more of the following properties:
    - `host`: the IoT Hub hostname
    - `sharedAccessSignature`: shared access signature with the permissions for the desired operations.]*/
    throw new ArgumentError('The \'config\' argument is missing either the host or the sharedAccessSignature property');
  }
  this._config = config;

  /*SRS_NODE_IOTHUB_REGISTRY_16_024: [The `Registry` constructor shall use the `httpHelper` provided as a second argument if it is provided.]*/
  /*SRS_NODE_IOTHUB_REGISTRY_16_025: [The `Registry` constructor shall use `azure-iot-http-base.Http` if no `httpHelper` argument is provided.]*/
  this._http = httpHelper || new HttpHelper();
}

/**
 * @method          module:azure-iothub.Registry.fromConnectionString
 * @description     Constructs a Registry object from the given connection
 *                  string using the default transport
 *                  ({@link module:azure-iothub.Http|Http}).
 * @param {String}  value       A connection string which encapsulates the
 *                              appropriate (read and/or write) Registry
 *                              permissions.
 * @returns {module:azure-iothub.Registry}
 */
Registry.fromConnectionString = function fromConnectionString(value) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_05_008: [The `fromConnectionString` method shall throw `ReferenceError` if the value argument is falsy.]*/
  if (!value) throw new ReferenceError('value is \'' + value + '\'');

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_05_009: [Otherwise, it shall derive and transform the needed parts from the connection string in order to create a `config` object for the constructor (see `SRS_NODE_IOTHUB_REGISTRY_05_001`).]*/
  var cn = ConnectionString.parse(value);
  var sas = SharedAccessSignature.create(cn.HostName, cn.SharedAccessKeyName, cn.SharedAccessKey, anHourFromNow());

  var config = {
    host: cn.HostName,
    sharedAccessSignature: sas.toString()
  };

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_05_010: [The `fromConnectionString` method shall return a new instance of the Registry object, as by a call to new Registry(config).]*/
  return new Registry(config);
};

/**
 * @method            module:azure-iothub.Registry.fromSharedAccessSignature
 * @description       Constructs a Registry object from the given shared access
 *                    signature using the default transport
 *                    ({@link module:azure-iothub.Http|Http}).
 * @param {String}    value     A shared access signature which encapsulates
 *                              the appropriate (read and/or write) Registry
 *                              permissions.
 * @returns {module:azure-iothub.Registry}
 */
Registry.fromSharedAccessSignature = function fromSharedAccessSignature(value) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_05_011: [The fromSharedAccessSignature method shall throw ReferenceError if the value argument is falsy.]*/
  if (!value) throw new ReferenceError('value is \'' + value + '\'');

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_05_012: [Otherwise, it shall derive and transform the needed parts from the shared access signature in order to create a `config` object for the constructor (see `SRS_NODE_IOTHUB_REGISTRY_05_001`).]*/
  var sas = SharedAccessSignature.parse(value);

  var config = {
    host: sas.sr,
    sharedAccessSignature: sas.toString()
  };

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_05_013: [The fromSharedAccessSignature method shall return a new instance of the Registry object, as by a call to new Registry(transport).]*/
  return new Registry(config);
};

Registry.prototype._executeApiCall = function (method, path, headers, body, done) {
  var httpHeaders = headers || {};

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_040: [All requests shall contain a `User-Agent` header that uniquely identifies the SDK and SDK version used.]*/
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_041: [All requests shall contain a `Request-Id` header that uniquely identifies the request and allows to trace requests/responses in the logs.]*/  
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_042: [All requests shall contain a `Authorization` header that contains a valid shared access key.]*/
  httpHeaders.Authorization = this._config.sharedAccessSignature;
  httpHeaders['Request-Id'] = uuid.v4();
  httpHeaders['User-Agent'] = PackageJson.name + '/' + PackageJson.version;

  var request = this._http.buildRequest(method, path, httpHeaders, this._config.host, function (err, body, response) {
      if (err) {
        if (response) {
          /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_035: [When any registry operation method receives an HTTP response with a status code >= 300, it shall invoke the done callback function with an error translated using the requirements detailed in `registry_http_errors_requirements.md`]*/
          done(translateError(body, response));
        } else {
          /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_033: [If any registry operation method encounters an error before it can send the request, it shall invoke the done callback function and pass the standard JavaScript Error object with a text description of the error (err.message).]*/
          done(err);
        }
      } else {
        /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_034: [When any registry operation receives an HTTP response with a status code < 300, it shall invoke the done callback function with the following arguments:
          - `err`: `null`
          - `result`: A javascript object parsed from the body of the HTTP response
          - `response`: the Node.js `http.ServerResponse` object returned by the transport]*/
        var responseBody = body ? JSON.parse(body) : '';
        done(null, responseBody, response);
      }
    });

    if (body) {
      request.write(JSON.stringify(body));
    }

    request.end();
};

/**
 * @method            module:azure-iothub.Registry#create
 * @description       Creates a new device identity on an IoT hub.
 * @param {Object}    deviceInfo  The object must include a `deviceId` property
 *                                with a valid device identifier.
 * @param {Function}  done        The function to call when the operation is
 *                                complete. `done` will be called with three
 *                                arguments: an Error object (can be null), a
 *                                {@link module:azure-iothub.Device|Device}
 *                                object representing the created device
 *                                identity, and a transport-specific response
 *                                object useful for logging or debugging.
 */
Registry.prototype.create = function (deviceInfo, done) {
  if (!deviceInfo) {
    /*Codes_SRS_NODE_IOTHUB_REGISTRY_07_001: [The `create` method shall throw `ReferenceError` if the `deviceInfo` argument is falsy. **]*/
    throw new ReferenceError('deviceInfo cannot be \'' + deviceInfo + '\'');
  } else if (!deviceInfo.deviceId) {
    /*Codes_SRS_NODE_IOTHUB_REGISTRY_07_001: [The create method shall throw ArgumentError if the first argument does not contain a deviceId property.]*/
    throw new ArgumentError('The object \'deviceInfo\' is missing the property: deviceId');
  }

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_026: [The `create` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  PUT /devices/<deviceInfo.deviceId>?api-version=<version> HTTP/1.1
  Authorization: <sharedAccessSignature>
  Content-Type: application/json; charset=utf-8
  If-Match: *
  Request-Id: <guid>

  <deviceInfo>
  ```]*/
  var path = endpoint.devicePath(deviceInfo.deviceId) + endpoint.versionQueryString();
  var httpHeaders = {
    'Content-Type': 'application/json; charset=utf-8'
  };

  this._executeApiCall('PUT', path, httpHeaders, deviceInfo, done);
};

/**
 * @method            module:azure-iothub.Registry#update
 * @description       Updates an existing device identity on an IoT hub with
 *                    the given device information.
 * @param {Object}    deviceInfo  An object which must include a `deviceId`
 *                                property whose value is a valid device
 *                                identifier.
 * @param {Function}  done        The function to call when the operation is
 *                                complete. `done` will be called with three
 *                                arguments: an Error object (can be null), a
 *                                {@link module:azure-iothub.Device|Device}
 *                                object representing the updated device
 *                                identity, and a transport-specific response
 *                                object useful for logging or debugging.
 */
Registry.prototype.update = function (deviceInfo, done) {
  if (!deviceInfo) {
    /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_043: [The `update` method shall throw `ReferenceError` if the `deviceInfo` argument is falsy.]*/
    throw new ReferenceError('deviceInfo cannot be \'' + deviceInfo + '\'');
  } else if (!deviceInfo.deviceId) {
    /* Codes_SRS_NODE_IOTHUB_REGISTRY_07_003: [The update method shall throw ArgumentError if the first argument does not contain a deviceId property.]*/
    throw new ArgumentError('The object \'deviceInfo\' is missing the property: deviceId');
  }

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_027: [The `update` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  PUT /devices/<deviceInfo.deviceId>?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature>
  Content-Type: application/json; charset=utf-8
  Request-Id: <guid>

  <deviceInfo>
  ```]*/
  var path = endpoint.devicePath(deviceInfo.deviceId) + endpoint.versionQueryString();
  var httpHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'If-Match': '*'
  };

  this._executeApiCall('PUT', path, httpHeaders, deviceInfo, done);
};

/**
 * @method            module:azure-iothub.Registry#get
 * @description       Requests information about an existing device identity
 *                    on an IoT hub.
 * @param {String}    deviceId    The identifier of an existing device identity.
 * @param {Function}  done        The function to call when the operation is
 *                                complete. `done` will be called with three
 *                                arguments: an Error object (can be null), a
 *                                {@link module:azure-iothub.Device|Device}
 *                                object representing the created device
 *                                identity, and a transport-specific response
 *                                object useful for logging or debugging.
 */
Registry.prototype.get = function (deviceId, done) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_05_006: [The get method shall throw ReferenceError if the supplied deviceId is falsy.]*/
  if (!deviceId) {
    throw new ReferenceError('deviceId is \'' + deviceId + '\'');
  }

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_028: [The `get` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  GET /devices/<deviceInfo.deviceId>?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature>
  Request-Id: <guid>
  ```]*/
  var path = endpoint.devicePath(deviceId) + endpoint.versionQueryString();

  this._executeApiCall('GET', path, null, null, done);
};

/**
 * @method            module:azure-iothub.Registry#list
 * @description       Requests information about the first 1000 device
 *                    identities on an IoT hub.
 * @param {Function}  done        The function to call when the operation is
 *                                complete. `done` will be called with three
 *                                arguments: an Error object (can be null), an
 *                                array of
 *                                {@link module:azure-iothub.Device|Device}
 *                                objects representing the listed device
 *                                identities, and a transport-specific response
 *                                object useful for logging or debugging.
 */
Registry.prototype.list = function (done) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_029: [The `list` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  GET /devices?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature>
  Request-Id: <guid>
  ```]*/
  var path = endpoint.devicePath('') + endpoint.versionQueryString();

  this._executeApiCall('GET', path, null, null, done);
};

/**
 * @method            module:azure-iothub.Registry#delete
 * @description       Removes an existing device identity from an IoT hub.
 * @param {String}    deviceId    The identifier of an existing device identity.
 * @param {Function}  done        The function to call when the operation is
 *                                complete. `done` will be called with three
 *                                arguments: an Error object (can be null), an
 *                                always-null argument (for consistency with
 *                                the other methods), and a transport-specific
 *                                response object useful for logging or
 *                                debugging.
 */
Registry.prototype.delete = function (deviceId, done) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_07_007: [The delete method shall throw ReferenceError if the supplied deviceId is falsy.]*/
  if (!deviceId) {
    throw new ReferenceError('deviceId is \'' + deviceId + '\'');
  }

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_030: [The `delete` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  DELETE /devices/<deviceInfo.deviceId>?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature>
  If-Match: *
  Request-Id: <guid>
  ```]*/
  var path = endpoint.devicePath(deviceId) + endpoint.versionQueryString();
  var httpHeaders = {
    'If-Match': '*'
  };

  this._executeApiCall('DELETE', path, httpHeaders, null, done);
};

/**
 * @method              module:azure-iothub.Registry#importDevicesFromBlob
 * @description         Imports devices from a blob in bulk job.
 * @param {String}      inputBlobContainerUri   The URI to a container with a blob named 'devices.txt' containing a list of devices to import.
 * @param {String}      outputBlobContainerUri  The URI to a container where a blob will be created with logs of the import process.
 * @param {Function}    done                    The function to call when the job has been created, with two arguments: an error object if an
 *                                              an error happened, (null otherwise) and the job status that can be used to track progress of the devices import.
 */
Registry.prototype.importDevicesFromBlob = function (inputBlobContainerUri, outputBlobContainerUri, done) {
  /* Codes_SRS_NODE_IOTHUB_REGISTRY_16_001: [A ReferenceError shall be thrown if importBlobContainerUri is falsy] */
  if (!inputBlobContainerUri) throw new ReferenceError('inputBlobContainerUri cannot be falsy');
  /* Codes_SRS_NODE_IOTHUB_REGISTRY_16_002: [A ReferenceError shall be thrown if exportBlobContainerUri is falsy] */
  if (!outputBlobContainerUri) throw new ReferenceError('outputBlobContainerUri cannot be falsy');

  /*SRS_NODE_IOTHUB_REGISTRY_16_031: [The `importDeviceFromBlob` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  POST /jobs/create?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature>
  Content-Type: application/json; charset=utf-8 
  Request-Id: <guid>

  {
    "type": "import",
    "inputBlobContainerUri": "<input container Uri given as parameter>",
    "outputBlobContainerUri": "<output container Uri given as parameter>"
  }
  ```]*/
  var path = "/jobs/create" + endpoint.versionQueryString();
  var httpHeaders = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  var importRequest = {
    'type': 'import',
    'inputBlobContainerUri': inputBlobContainerUri,
    'outputBlobContainerUri': outputBlobContainerUri
  };

  this._executeApiCall('POST', path, httpHeaders, importRequest, done);
};

/**
 * @method              module:azure-iothub.Registry#exportDevicesToBlob
 * @description         Export devices to a blob in a bulk job.
 * @param {String}      outputBlobContainerUri  The URI to a container where a blob will be created with logs of the export process.
 * @param {Boolean}     excludeKeys             Boolean indicating whether security keys should be excluded from the exported data.
 * @param {Function}    done                    The function to call when the job has been created, with two arguments: an error object if an
 *                                              an error happened, (null otherwise) and the job status that can be used to track progress of the devices export.
 */
Registry.prototype.exportDevicesToBlob = function (outputBlobContainerUri, excludeKeys, done) {
  /* Codes_SRS_NODE_IOTHUB_REGISTRY_16_004: [A ReferenceError shall be thrown if outputBlobContainerUri is falsy] */
  if (!outputBlobContainerUri) throw new ReferenceError('outputBlobContainerUri cannot be falsy');

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_032: [** The `exportDeviceToBlob` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  POST /jobs/create?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature>
  Content-Type: application/json; charset=utf-8 
  Request-Id: <guid>

  {
    "type": "export",
    "outputBlobContainerUri": "<output container Uri given as parameter>",
    "excludeKeysInExport": "<excludeKeys Boolean given as parameter>"
  }
  ```]*/
  var path = "/jobs/create" + endpoint.versionQueryString();
  var httpHeaders = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  var exportRequest = {
    'type': 'export',
    'outputBlobContainerUri': outputBlobContainerUri,
    'excludeKeysInExport': excludeKeys
  };

  this._executeApiCall('POST', path, httpHeaders, exportRequest, done);
};

/**
 * @method              module:azure-iothub.Registry#listJobs
 * @description         List the last import/export jobs (including the active one, if any).
 * @param {Function}    done    The function to call with two arguments: an error object if an error happened,
 *                              (null otherwise) and the list of past jobs as an argument.
 */
Registry.prototype.listJobs = function (done) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_037: [The `listJobs` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  GET /jobs?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature> 
  Request-Id: <guid>
  ```]*/
  var path = "/jobs" + endpoint.versionQueryString();
  
  this._executeApiCall('GET', path, {}, null, done);
};

/**
 * @method              module:azure-iothub.Registry#getJob
 * @description         Get the status of a bulk import/export job.
 * @param {String}      jobId   The identifier of the job for which the user wants to get status information.
 * @param {Function}    done    The function to call with two arguments: an error object if an error happened,
 *                              (null otherwise) and the status of the job whose identifier was passed as an argument.
 */
Registry.prototype.getJob = function (jobId, done) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_006: [A ReferenceError shall be thrown if jobId is falsy] */
  if (!jobId) throw new ReferenceError('jobId cannot be falsy');

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_038: [The `getJob` method shall construct an HTTP request using information supplied by the caller, as follows:
  ```
  GET /jobs/<jobId>?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature> 
  Request-Id: <guid>
  ```]*/
  var path = "/jobs/" + jobId + endpoint.versionQueryString();
  this._executeApiCall('GET', path, null, null, done);
};

/**
 * @method              module:azure-iothub.Registry#cancelJob
 * @description         Cancel a bulk import/export job.
 * @param {String}      jobId   The identifier of the job for which the user wants to get status information.
 * @param {Function}    done    The function to call with two arguments: an error object if an error happened,
 *                              (null otherwise) and the (cancelled) status of the job whose identifier was passed as an argument.
 */
Registry.prototype.cancelJob = function (jobId, done) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_012: [A ReferenceError shall be thrown if the jobId is falsy] */
  if (!jobId) throw new ReferenceError('jobId cannot be falsy');

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_039: [The `cancelJob` method shall construct an HTTP request using information supplied by the caller as follows:
  ```
  DELETE /jobs/<jobId>?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature>
  Request-Id: <guid>
  ```]*/
  var path = "/jobs/" + jobId + endpoint.versionQueryString();
  this._executeApiCall('DELETE', path, null, null, done);
};

/**
 * @method              module:azure-iothub.Registry#getDeviceTwin
 * @description         Gets the Device Twin of the device with the specified device identifier.
 * @param {String}      deviceId   The device identifier.
 * @param {Function}    done       The callback that will be called with either an Error object or 
 *                                 the device twin instance.
 */
Registry.prototype.getDeviceTwin = function (deviceId, done) {
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_019: [The `getDeviceTwin` method shall throw a `ReferenceError` if the `deviceId` parameter is falsy.]*/
  if (!deviceId) throw new ReferenceError('the \'deviceId\' cannot be falsy');
  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_020: [The `getDeviceTwin` method shall throw a `ReferenceError` if the `done` parameter is falsy.]*/
  if (!done) throw new ReferenceError('the \'done\' argument cannot be falsy');

  /*Codes_SRS_NODE_IOTHUB_REGISTRY_16_036: [** The `getDeviceTwin` method shall construct an HTTP request using the information supplied by the caller as follows:
  ```
  GET /twins/<deviceId>?api-version=<version> HTTP/1.1
  Authorization: <config.sharedAccessSignature>
  Request-Id: <guid>
  ```]*/
  var path = "/twins/" + deviceId + endpoint.versionQueryString();
  this._executeApiCall('GET', path, null, null, done);
};

module.exports = Registry;
