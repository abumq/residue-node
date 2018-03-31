TYPE=`uname | tr '[:upper:]' '[:lower:]'`

# Download
npm install -g residue-$TYPE

# Start
export RESIDUE_HOME=`pwd`/test/server/
sudo nohup residue-$TYPE $RESIDUE_HOME/conf.json -v &

cat nohup.out
