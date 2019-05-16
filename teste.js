var NginxConfFile = require('nginx-conf').NginxConfFile;

NginxConfFile.create(__dirname+'/0-default.conf', function(err, conf) {
	if (err) {
		console.log(err);
		return;
	}

	//reading values
	console.log(conf.nginx.upstream.server.toString()); //www www
	conf.nginx.upstream._add('server', '1.1.1.1');
	console.log(conf.nginx.upstream.server.toString()); 
	conf.live(__dirname+'/0-nodes.conf');
	conf.die(__dirname+'/0-default.conf');
});
