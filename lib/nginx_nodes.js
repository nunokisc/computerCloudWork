var NginxConfFile = require('nginx-conf').NginxConfFile;
var onlineNginxNodeContainers = [];
module.exports = {
	createNewNginxNode: function() {
		let randomPhpIp = "";
		let randomNginxIp = "";
		let nginxlbId = "";
		let containerNumber = onlineNginxNodeContainers.length;
		//push to array new nginx node container
		onlineNginxNodeContainers.push({name: 'cwc-nginx-'+containerNumber});
		//get loadbalancer container id
		for (let i = 0; i < onlineContainers.length; i++) {
			if(onlineContainers[i].name == rootContainers.nginxlb.name)
			{
				nginxlbId = onlineContainers[i].id;
			}
		}
		// generate new ip /24
		while (true) 
		{
			randomPhpIp = "172.18.0."+(Math.floor(Math.random() * 255) + 2);
		    //verify if ip is not in use
		    if(!usedIps.includes(randomPhpIp))
		    {
		    	console.log(randomPhpIp);
		    	break;
		    }
		}
		//start phpfpm node container
		startContainer('php-fpm', 'cwc-php-fpm-'+containerNumber, [absolutePath+'/html:/var/www/html'],randomPhpIp);
		console.log("startContainer: "+'php-fpm'+' '+'cwc-php-fpm-'+containerNumber+' '+[absolutePath+'/html:/var/www/html']+' '+randomPhpIp);
		//create nginx node conf file
		NginxConfFile.create(__dirname+'/http/conf.d/default.conf', function(err, conf) {
			if (err) {
				console.log(err);
				return;
			}

			//reading values
			conf.nginx.server.add_header._value = "X_NODE cwc-nginx-"+containerNumber;
			conf.nginx.server.location[1].fastcgi_pass._value = randomPhpIp+":9000";
			conf.live(__dirname+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf');
			conf.die(__dirname+'/http/conf.d/default.conf');
		});
		// generate new ip /24
		while (true) 
		{
			randomNginxIp = "172.18.0."+(Math.floor(Math.random() * 255) + 2);
		  	//verify if ip is not in use
		  	if(!usedIps.includes(randomNginxIp))
		  	{
		  		console.log(randomNginxIp);
		  		break;
		  	}
		  }
		// start nginx node container
		startContainer('nginx', 'cwc-nginx-'+containerNumber, [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf:/etc/nginx/conf.d/default.conf'],randomNginxIp);
		console.log("startContainer: "+'nginx'+' '+'cwc-nginx-'+containerNumber+' '+[absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf:/etc/nginx/conf.d/default.conf']+' '+randomNginxIp);
		//add ip of new nginx node container to loadbalancer conf
		NginxConfFile.create(__dirname+'/loadbalancer/conf.d/0-default.conf', function(err, conf) {
			if (err) {
				console.log(err);
				return;
			}
			conf.nginx.upstream._add('server', randomNginxIp);
		});
		let container = docker.getContainer(nginxlbId);
		var options = {
			Cmd: ['/usr/sbin/nginx', '-s', 'reload'],
			AttachStdout: true,
			AttachStderr: true
		};
		//reload nginx service in loadbalancer 
		container.exec(options, function(err, exec) {
			if (err) return;
			exec.start(function(err, stream) {
				if (err) return;

				container.modem.demuxStream(stream, process.stdout, process.stderr);

				exec.inspect(function(err, data) {
					if (err) return;
					console.log(data);
				});
			});
		});
	}
};