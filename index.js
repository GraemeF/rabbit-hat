var uuid = require('node-uuid');
var request = require('request');
var async = require('async');
var _ = require('underscore');
var oibackoff = require('oibackoff');

const prefix = 'node-test-';

var RabbitHat = function(connectionInfo) {
    this.name = prefix + uuid.v4();
    this.login = connectionInfo.login;
    this.managementApiUri = 'http://' + connectionInfo.login + ':' + connectionInfo.password + '@' + connectionInfo.host + ':55672/api';
  };

function setPermissions(self, callback) {
  request.put({
    uri: self.managementApiUri + '/permissions/' + self.name + '/' + self.login,
    json: {
      "configure": ".*",
      "write": ".*",
      "read": ".*"
    }
  }, callback);
}

RabbitHat.prototype.createUri = function(name) {
  return this.managementApiUri + '/vhosts/' + name;
};

RabbitHat.prototype.create = function(callback) {
  var self = this;
  request.put({
    uri: this.createUri(this.name),
    json: {}
  }, function(error, resp) {
    if (error) {
      return callback(error);
    }
    if (resp.statusCode !== 204) {
      return callback(new Error('Failed to create vhost: ' + resp.statusCode));
    }

    setPermissions(self, callback);
  });
};

function checkForErrorStatus(vhostUri, error, resp) {
  if (error) {
    return error;
  }
  if (resp.statusCode !== 204) {
    return new Error('Failed to delete vhost at ' + vhostUri + ': ' + resp.statusCode);
  }
  return error;
}

RabbitHat.prototype.destroyByName = function(name, callback) {
  var uri = this.createUri(name);

  var backoff = oibackoff.backoff({
    algorithm: 'incremental',
    delayRatio: 0,
    maxTries: 0
  });

  var tryDestroy = function(callback) {
      request({
        uri: uri,
        method: 'DELETE'
      }, function(error, resp) {
        callback(checkForErrorStatus(uri, error, resp), resp);
      });
    };

  backoff(tryDestroy, function(error, resp, priorErrors) {
    callback(checkForErrorStatus(uri, error, resp), resp);
  });
};

RabbitHat.prototype.destroy = function(callback) {
  this.destroyByName(this.name, callback);
};

RabbitHat.prototype.getAll = function(callback) {
  request({
    uri: this.managementApiUri + '/vhosts',
    json: true
  }, function(err, response, body) {
    if (!err && response.statusCode == 200) {
      callback(err, _.filter(_.map(body, function(x) {
        return x.name;
      }), function(x) {
        return x.indexOf(prefix) === 0;
      }));
    } else {
      callback(err);
    }
  });
};

RabbitHat.prototype.destroyAll = function(callback) {

  var self = this;

  self.getAll(function(err, vhosts) {
    if (err) {
      return callback(err);
    }

    async.forEach(vhosts, function(name, cb) {
      self.destroyByName(name, cb);
    }, callback);
  });
};

module.exports = RabbitHat;
