# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install app dependencies
RUN npm install
# If you are using yarn:
# RUN yarn install

# Bundle app source
COPY . .

# Make port 80 available to the world outside this container
EXPOSE 80

# Define environment variable
ENV NODE_ENV production
ENV PORT 80
ENV DB_PATH ./db/taysell.sqlite

# Create a non-root user and switch to it
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Ensure the db directory exists and is writable by the appuser
RUN mkdir -p ./db && chown appuser:appgroup ./db

USER appuser

# Run the app when the container launches
CMD [ "node", "index.js" ]
