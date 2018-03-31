TYPE=`uname | tr '[:upper:]' '[:lower:]'`

# Download
npm install -g residue-$TYPE

# Start
sudo nohup residue-$TYPE $RESIDUE_HOME/conf.json -v &

