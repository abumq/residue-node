TYPE=`uname | tr '[:upper:]' '[:lower:]'`

# Download
npm install -g residue-$TYPE

#wget https://github.com/muflihun/residue/releases/download/v2.3.3/residue-2.3.3-$TYPE-debug-x86_64.tar.gz
#tar -xf residue-2.3.3-$TYPE-debug-x86_64.tar.gz

# Start
export RESIDUE_HOME=`pwd`/test/server/
#residue-2.3.3-$TYPE-debug-x86_64/residue --version
#nohup residue-2.3.3-$TYPE-debug-x86_64/residue $RESIDUE_HOME/conf.json -v --force-without-root --residue-home=$RESIDUE_HOME &
nohup residue-$TYPE $RESIDUE_HOME/conf.json -v --force-without-root --residue-home=$RESIDUE_HOME &
ls -l
cat nohup.out
echo '' > test/residue.log
