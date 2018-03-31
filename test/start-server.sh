TYPE=`uname | tr '[:upper:]' '[:lower:]'`

export RESIDUE_HOME=`pwd`/test/server/

USE_NPM="false"

if [ "$USE_NPM" = "true" ];then
    npm install -g residue-$TYPE
    residue-$TYPE --version
    nohup residue-$TYPE $RESIDUE_HOME/conf.json -v --force-without-root --residue-home=$RESIDUE_HOME &
else

    SERVER_VERSION=2.3.3

    wget https://github.com/muflihun/residue/releases/download/v$SERVER_VERSION/residue-$SERVER_VERSION-$TYPE-debug-x86_64.tar.gz
    tar -xf residue-$SERVER_VERSION-$TYPE-debug-x86_64.tar.gz

    residue-$SERVER_VERSION-$TYPE-debug-x86_64/residue --version
    nohup residue-$SERVER_VERSION-$TYPE-debug-x86_64/residue $RESIDUE_HOME/conf.json -v --force-without-root --residue-home=$RESIDUE_HOME &
fi

ls -l
echo 'nohup.out contents: '
cat nohup.out
echo 'end of nohup.out contents'
echo '' > test/residue.log
