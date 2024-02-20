

function compare(query, string){
  query = query.replace(/[^a-zA-Z0-9 -]/g, '');
  let pattern = new RegExp(`^${query}`, 'i')
  if(pattern.test(string)){
    return({result: true, pattern: 0})
  }
  pattern = new RegExp(`(\\s|-)${query}`, 'i')
  if(pattern.test(string)){
    return({result: true, pattern: 1})
  }
  return { result: false}
}

module.exports = {compare}