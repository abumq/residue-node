TYPE=`uname | tr '[:upper:]' '[:lower:]'`

# Download
npm install -g residue-$TYPE

# Start
export RESIDUE_HOME=`pwd`/test/server/
nohup residue-$TYPE $RESIDUE_HOME/conf.json -v --force-without-root --residue-home=$RESIDUE_HOME &
ls -l
cat nohup.out
echo '' > test/residue.log
