# computerCloudWork

Este projecto consistem em escalar automaticamente em Docker um site em Wordpress dependendo dos pedidos e conexões por segundo recebidos. Desenvolvido em node.JS com o dockerode.

# Run

    docker pull kisc/nginx-telegraf
    docker pull kisc/php-fpm-kisc
    docker pull mariadb
    docker pull influxdb
    docker pull tiagosantana/grafana
    docker network create --driver=bridge --subnet=172.18.0.0/16 br0
    
   After: 
   
	npm install
	node index.js
	go to cwc.cuscarias.com

# State

 - [x] Iniciar container LoadBalancer - Nginx
 - [x] Iniciar container HTTP - Nginx
 - [x] Iniciar container Mysql - Nginx
 - [x] Iniciar container PHP - php-fpm
 - [x] Iniciar container InfluxDB
 - [x] Criar containers Nodes - Nginx
 - [x] Configurar novos containers Nodes - Nginx no LoadBalancer
 - [x] Adicionar containers HTTP e PHP consoante a carga até um maximo de x por LoadBalancer
 - [x] Eliminar containers HTTP e PHP quando a carga diminui
 - [x] Adicionar containers LoadBalancer consoante a carga
 - [x] Eliminar containers LoadBalancer consoante a carga
 
