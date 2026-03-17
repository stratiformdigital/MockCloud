Output demo.mp4

Set Shell "zsh"
Set FontSize 16
Set Width 1000
Set Height 600
Set Padding 20
Set TypingSpeed 40ms

# Clone and install
Type "git clone https://github.com/stratiformdigital/MockCloud.git && cd MockCloud"
Enter
Sleep 5

Type "yarn"
Enter
Sleep 5

Type "cd console && yarn install && yarn build && cd .."
Enter
Sleep 8

# Start the server
Type "./run start"
Enter
Sleep 8

# Configure AWS CLI
Type 'eval "$(./run env)"'
Enter
Sleep 2

# Create an S3 bucket
Type "aws s3 mb s3://my-app-uploads"
Enter
Sleep 3

# Upload a file
Type 'echo "hello world" > /tmp/hello.txt && aws s3 cp /tmp/hello.txt s3://my-app-uploads/'
Enter
Sleep 3

# List objects
Type "aws s3 ls s3://my-app-uploads/"
Enter
Sleep 3

# Create a secret
Type 'aws secretsmanager create-secret --name my-api-key --secret-string "sk-demo-12345"'
Enter
Sleep 4

# Create a DynamoDB table
Type "aws dynamodb create-table --table-name users \"
Enter
Type "  --attribute-definitions AttributeName=id,AttributeType=S \"
Enter
Type "  --key-schema AttributeName=id,KeyType=HASH \"
Enter
Type "  --billing-mode PAY_PER_REQUEST"
Enter
Sleep 5

# Web console
Type 'echo "Web console available at http://localhost:4444"'
Enter
Sleep 3
