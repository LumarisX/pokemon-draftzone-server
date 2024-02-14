

function compare(query, string){
  query = query.trim()
  let pattern = new RegExp(`^${query}`, 'i')
  if(pattern.test(string)){
    return({result: true, pattern: 0})
  }
  pattern = new RegExp(`(\\s|-)${query}`, 'i')
  if(pattern.test(string)){
    return({result: true, pattern: 1})
  }
  pattern= new RegExp(`${query}`, 'i')
  if (pattern.test(string)) {
    return ({ result: true, pattern: 2 })
  }
  return { result: false}
}

module.exports = {compare}