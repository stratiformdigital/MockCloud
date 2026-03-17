# MockCloud Terminal Demo
# Run with: cd ~/temp && vhs path/to/scripts/record-terminal-demo.tape

Output demo.gif

Set Shell "zsh"
Set FontSize 16
Set Width 1000
Set Height 600
Set Padding 20
Set TypingSpeed 40ms

# Clean up any previous state
Hide
Type "export YARN_ENABLE_PROGRESS_BARS=false AWS_PAGER="
Enter
Sleep 1
Type "pkill -f DynamoDBLocal 2>/dev/null; true"
Enter
Sleep 1
Type "cd MockCloud 2>/dev/null && ./run reset 2>/dev/null; cd ..; rm -rf MockCloud; true"
Enter
Sleep 2
Type "clear"
Enter
Sleep 1
Show

# Clone and install
Type "git clone https://github.com/JonHolman/MockCloud.git && cd MockCloud"
Enter
Sleep 8

Type "yarn"
Enter
Sleep 15

# Start the server
Type "./run start"
Enter
Sleep 180

# Configure AWS CLI
Type 'eval "$(./run env)"'
Enter
Sleep 1

# Create an S3 bucket
Type "aws s3 mb s3://my-app-uploads"
Enter
Sleep 2

# Upload a file
Type 'echo "hello world" > /tmp/hello.txt && aws s3 cp /tmp/hello.txt s3://my-app-uploads/'
Enter
Sleep 2

# List objects
Type "aws s3 ls s3://my-app-uploads/"
Enter
Sleep 2

# Create a secret
Type 'aws secretsmanager create-secret --name my-api-key --secret-string "sk-demo-12345"'
Enter
Sleep 2

# Create a DynamoDB table
Type "aws dynamodb create-table --table-name users \"
Enter
Type "  --attribute-definitions AttributeName=id,AttributeType=S \"
Enter
Type "  --key-schema AttributeName=id,KeyType=HASH \"
Enter
Type "  --billing-mode PAY_PER_REQUEST"
Enter
Sleep 3

# Web console
Type 'echo "Web console available at http://localhost:4444"'
Enter
Sleep 3
